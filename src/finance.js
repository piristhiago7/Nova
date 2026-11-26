const { db } = require('./db.js');

// Format ARS currency
function formatARS(amount) {
  const num = Math.round(Number(amount) || 0);
  return '$ ' + num.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}

// Calculate comprehensive financial overview
function getFinancialOverview() {
  // 1. Fixed costs
  const fixedCostsRows = db.prepare('SELECT * FROM fixed_costs WHERE is_active = 1').all();
  const totalFixedCosts = fixedCostsRows.reduce((acc, row) => acc + Number(row.amount), 0);

  // Fixed costs by category
  const fixedByCategory = {};
  for (const row of fixedCostsRows) {
    fixedByCategory[row.category] = (fixedByCategory[row.category] || 0) + Number(row.amount);
  }

  // 2. Variable costs recorded in ledger
  const variableCostsRows = db.prepare('SELECT * FROM variable_costs').all();
  const totalVariableLedger = variableCostsRows.reduce((acc, row) => acc + Number(row.amount), 0);

  // Variable costs by category
  const variableByCategory = {};
  for (const row of variableCostsRows) {
    variableByCategory[row.category] = (variableByCategory[row.category] || 0) + Number(row.amount);
  }

  // 3. Orders analytics (excluding Cancelled)
  const orders = db.prepare("SELECT * FROM orders WHERE status != 'Cancelado' ORDER BY created_at DESC").all();
  const allOrdersCount = orders.length;

  let totalRevenue = 0;
  let totalProductRevenue = 0;
  let totalShippingCharged = 0;
  let totalProductionCost = 0;
  let totalPackagingCost = 0;
  let totalShippingRealCost = 0;
  let totalPaymentFees = 0;
  let totalUnitsSold = 0;

  for (const order of orders) {
    totalRevenue += Number(order.total);
    totalProductRevenue += Number(order.subtotal);
    totalShippingCharged += Number(order.shipping_cost_charged);
    totalProductionCost += Number(order.cost_production_total);
    totalPackagingCost += Number(order.cost_packaging);
    totalShippingRealCost += Number(order.cost_shipping_real);
    totalPaymentFees += Number(order.cost_fee);

    try {
      const items = JSON.parse(order.items || '[]');
      for (const it of items) {
        totalUnitsSold += Number(it.quantity || 1);
      }
    } catch {}
  }

  const totalDirectVariableCosts = totalProductionCost + totalPackagingCost + totalShippingRealCost + totalPaymentFees;
  const grossProfit = totalRevenue - totalDirectVariableCosts;
  const grossMarginPercent = totalRevenue > 0 ? (grossProfit / totalRevenue) * 100 : 0;

  // Net Profit considers Fixed Costs
  const netProfit = grossProfit - totalFixedCosts;
  const netMarginPercent = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;

  const averageTicket = allOrdersCount > 0 ? totalRevenue / allOrdersCount : 0;
  const averagePricePerUnit = totalUnitsSold > 0 ? totalProductRevenue / totalUnitsSold : 0;
  const averageCostPerUnit = totalUnitsSold > 0 ? totalProductionCost / totalUnitsSold : 0;
  const contributionMarginPerUnit = averagePricePerUnit - averageCostPerUnit;

  // Break-even point (Punto de Equilibrio)
  const breakEvenUnits = contributionMarginPerUnit > 0 ? Math.ceil(totalFixedCosts / contributionMarginPerUnit) : 0;
  const contributionRatio = averagePricePerUnit > 0 ? contributionMarginPerUnit / averagePricePerUnit : 0;
  const breakEvenRevenue = contributionRatio > 0 ? Math.round(totalFixedCosts / contributionRatio) : 0;

  // Monthly breakdown for charts
  const monthlyData = {};
  for (const order of orders) {
    const monthKey = order.created_at ? order.created_at.substring(0, 7) : '2026-11';
    if (!monthlyData[monthKey]) {
      monthlyData[monthKey] = {
        month: monthKey,
        revenue: 0,
        directCosts: 0,
        grossProfit: 0,
        ordersCount: 0
      };
    }
    const orderDirectCosts = Number(order.cost_production_total) + Number(order.cost_packaging) +
      Number(order.cost_shipping_real) + Number(order.cost_fee);
    monthlyData[monthKey].revenue += Number(order.total);
    monthlyData[monthKey].directCosts += orderDirectCosts;
    monthlyData[monthKey].grossProfit += (Number(order.total) - orderDirectCosts);
    monthlyData[monthKey].ordersCount += 1;
  }

  // Monthly array sorted
  const monthlyList = Object.values(monthlyData).sort((a, b) => a.month.localeCompare(b.month));

  // Top products sold
  const topProductsMap = {};
  for (const order of orders) {
    try {
      const items = JSON.parse(order.items || '[]');
      for (const item of items) {
        const id = item.productId || item.name;
        if (!topProductsMap[id]) {
          topProductsMap[id] = {
            id,
            name: item.name,
            units: 0,
            revenue: 0
          };
        }
        topProductsMap[id].units += Number(item.quantity || 1);
        topProductsMap[id].revenue += Number(item.unitPrice || 0) * Number(item.quantity || 1);
      }
    } catch {}
  }
  const topProducts = Object.values(topProductsMap).sort((a, b) => b.units - a.units).slice(0, 5);

  return {
    kpis: {
      totalRevenue,
      totalProductRevenue,
      totalShippingCharged,
      totalFixedCosts,
      totalDirectVariableCosts,
      totalVariableLedger,
      grossProfit,
      grossMarginPercent: Number(grossMarginPercent.toFixed(1)),
      netProfit,
      netMarginPercent: Number(netMarginPercent.toFixed(1)),
      allOrdersCount,
      totalUnitsSold,
      averageTicket: Math.round(averageTicket),
      averagePricePerUnit: Math.round(averagePricePerUnit),
      averageCostPerUnit: Math.round(averageCostPerUnit),
      breakEvenUnits,
      breakEvenRevenue
    },
    fixedByCategory,
    variableByCategory,
    monthlyList,
    topProducts
  };
}

// Calculate individual order financial audit
function getOrderFinancialAudit(orderId) {
  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
  if (!order) return null;

  // Monthly fixed costs and total active orders count
  const fixedTotal = db.prepare('SELECT SUM(amount) as t FROM fixed_costs WHERE is_active = 1').get().t || 0;
  const activeOrdersCount = db.prepare("SELECT COUNT(*) as c FROM orders WHERE status != 'Cancelado'").get().c || 1;

  const orderTotal = Number(order.total);
  const subtotal = Number(order.subtotal);
  const shippingCharged = Number(order.shipping_cost_charged);

  const costProduction = Number(order.cost_production_total);
  const costPackaging = Number(order.cost_packaging);
  const costShippingReal = Number(order.cost_shipping_real);
  const costFee = Number(order.cost_fee);

  const totalVariable = costProduction + costPackaging + costShippingReal + costFee;
  const grossProfit = orderTotal - totalVariable;
  const grossMarginPercent = orderTotal > 0 ? (grossProfit / orderTotal) * 100 : 0;

  // Proportional fixed cost allocation
  // Method 1: Per-order equal allocation
  const allocatedFixedPerOrder = Math.round(fixedTotal / Math.max(activeOrdersCount, 1));

  // Net profit estimated for this single order
  const netProfitEstimated = grossProfit - allocatedFixedPerOrder;
  const netMarginPercent = orderTotal > 0 ? (netProfitEstimated / orderTotal) * 100 : 0;

  let items = [];
  try {
    items = JSON.parse(order.items || '[]');
  } catch {}

  let shippingAddress = null;
  try {
    if (order.shipping_address) shippingAddress = JSON.parse(order.shipping_address);
  } catch {}

  return {
    order: {
      ...order,
      items,
      shipping_address: shippingAddress
    },
    financials: {
      income: {
        productSales: subtotal,
        shippingCharged: shippingCharged,
        totalIncome: orderTotal
      },
      costs: {
        costProduction,
        costPackaging,
        costShippingReal,
        costFee,
        totalVariable
      },
      grossProfit,
      grossMarginPercent: Number(grossMarginPercent.toFixed(1)),
      allocatedFixedCost: allocatedFixedPerOrder,
      netProfitEstimated,
      netMarginPercent: Number(netMarginPercent.toFixed(1))
    }
  };
}

module.exports = {
  formatARS,
  getFinancialOverview,
  getOrderFinancialAudit
};
