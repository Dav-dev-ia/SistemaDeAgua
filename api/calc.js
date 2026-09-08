'use strict';

// ─── Lógica pura de facturación (testable) ────────────────────────────────────
// Reparto justo de la factura general del proveedor:
//   amountDue_i = factura × (consumo_efectivo_i / consumo_efectivo_total)
// donde consumo_efectivo = consumo × coeficiente (metodología de medidor).
// Cada monto se redondea a 2 decimales y se concilia para que Σ exacta = factura.

const round2 = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return 0;
  return Math.round((v + Number.EPSILON) * 100) / 100;
};

function distributeInvoice({ invoiceBs, readings, coefficients = {}, pricePerM3 = 7.5 }) {
  const invoice = round2(invoiceBs);
  if (!(invoice > 0)) {
    throw new Error('El monto total a repartir debe ser mayor que cero.');
  }

  const norm = readings.map((r) => {
    const consumptionM3 = round2(r.consumptionM3);
    const coef = Number(coefficients[r.apartmentId]);
    const coefficient = Number.isFinite(coef) && coef > 0 ? coef : 1;
    return {
      apartmentId: r.apartmentId,
      consumptionM3,
      coefficient,
      effectiveM3: round2(consumptionM3 * coefficient),
    };
  });

  const totalConsumption = round2(norm.reduce((s, i) => s + i.consumptionM3, 0));
  if (totalConsumption <= 0) {
    throw new Error('El consumo total debe ser mayor que cero.');
  }
  const totalEffective = round2(norm.reduce((s, i) => s + i.effectiveM3, 0));
  if (totalEffective <= 0) {
    throw new Error('El consumo efectivo total debe ser mayor que cero.');
  }

  const raw = norm.map((i) => ({ ...i, share: i.effectiveM3 / totalEffective }));

  let distributed = 0;
  const roundedAlloc = raw.map((i) => {
    const amountDueBs = round2(invoice * i.share);
    distributed += amountDueBs;
    return { ...i, amountDueBs };
  });

  // Conciliar redondeo: ajustar el primer ítem para que Σ === factura exacta
  const remainder = round2(invoice - distributed);
  if (remainder !== 0 && roundedAlloc.length > 0) {
    roundedAlloc[0].amountDueBs = round2(roundedAlloc[0].amountDueBs + remainder);
  }

  const price = round2(pricePerM3);
  const allocations = roundedAlloc.map((i) => {
    const baseBs = round2(i.consumptionM3 * price);
    return {
      apartmentId: i.apartmentId,
      consumptionM3: i.consumptionM3,
      coefficient: i.coefficient,
      effectiveM3: i.effectiveM3,
      percentageShare: round2(i.share * 100),
      amountDueBs: i.amountDueBs,
      baseBs,
      commonShareBs: round2(i.amountDueBs - baseBs),
    };
  });

  return {
    summary: {
      invoiceBs: invoice,
      pricePerM3: price,
      totalConsumptionM3: totalConsumption,
      totalEffectiveM3: totalEffective,
      distributedTotalBs: round2(allocations.reduce((s, i) => s + i.amountDueBs, 0)),
    },
    allocations,
  };
}

function buildBreakdown({ item, summary, periodCode, generalTotal }) {
  return JSON.stringify({
    period_code: periodCode,
    price_per_m3: summary.pricePerM3,
    consumption_m3: item.consumptionM3,
    coefficient: item.coefficient,
    effective_consumption_m3: item.effectiveM3,
    total_consumption_m3: summary.totalConsumptionM3,
    total_effective_m3: summary.totalEffectiveM3,
    share_percent: item.percentageShare,
    base_bs: item.baseBs,
    common_share_bs: item.commonShareBs,
    invoice_bs: summary.invoiceBs,
    distributed_total_bs: summary.distributedTotalBs,
    general_total_consumption_m3: generalTotal,
    common_difference_m3: generalTotal > 0
      ? round2(generalTotal - summary.totalConsumptionM3)
      : 0,
  });
}

function computePending(amountDue, amountPaid) {
  return Math.max(0, round2(Number(amountDue) - Number(amountPaid)));
}

module.exports = { round2, distributeInvoice, buildBreakdown, computePending };