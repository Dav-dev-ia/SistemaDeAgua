'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');

const { round2, distributeInvoice, buildBreakdown, computePending } = require('../api/calc');

test('round2 redondea correctamente', () => {
  assert.equal(round2(1.005), 1.01);
  assert.equal(round2(1000.0001), 1000);
  assert.equal(round2(12.3456), 12.35);
  assert.equal(round2('abc'), 0);
  assert.equal(round2(null), 0);
});

test('distributeInvoice: reparto proporcional simple (única unidad recibe toda la factura)', () => {
  const res = distributeInvoice({
    invoiceBs: 1000,
    readings: [{ apartmentId: 1, consumptionM3: 20 }],
    coefficients: { 1: 1 },
    pricePerM3: 7.5,
  });
  assert.equal(res.summary.distributedTotalBs, 1000);
  assert.equal(res.allocations[0].amountDueBs, 1000);
  assert.equal(res.allocations[0].baseBs, 150);
  assert.equal(res.allocations[0].commonShareBs, 850);
  assert.equal(res.allocations[0].percentageShare, 100);
});

test('distributeInvoice: suma exacta con conciliación (redondeo)', () => {
  const res = distributeInvoice({
    invoiceBs: 1000.37,
    readings: [{ apartmentId: 1, consumptionM3: 33.333 }, { apartmentId: 2, consumptionM3: 66.666 }],
    coefficients: { 1: 1, 2: 1 },
    pricePerM3: 7.5,
  });
  const sum = res.allocations.reduce((s, a) => s + a.amountDueBs, 0);
  assert.ok(Math.abs(sum - 1000.37) < 1e-9, `Σ=${sum} debe ser 1000.37`);
});

test('distributeInvoice: el coeficiente modifica la participación', () => {
  const res = distributeInvoice({
    invoiceBs: 3000,
    readings: [{ apartmentId: 1, consumptionM3: 10 }, { apartmentId: 2, consumptionM3: 10 }],
    coefficients: { 1: 1, 2: 3 },
    pricePerM3: 7.5,
  });
  const a1 = res.allocations.find((a) => a.apartmentId === 1);
  const a2 = res.allocations.find((a) => a.apartmentId === 2);
  assert.equal(a1.effectiveM3, 10);
  assert.equal(a2.effectiveM3, 30);
  assert.equal(a1.amountDueBs, 750);
  assert.equal(a2.amountDueBs, 2250);
  assert.ok(Math.abs((a1.amountDueBs + a2.amountDueBs) - 3000) < 1e-9);
});

test('distributeInvoice: medidor invertido (valor negativo de lectura) suma a reparto', () => {
  const res = distributeInvoice({
    invoiceBs: 600,
    readings: [{ apartmentId: 1, consumptionM3: 2 }, { apartmentId: 2, consumptionM3: 10 }],
    coefficients: {},
    pricePerM3: 0,
  });
  assert.ok(res.allocations[0].consumptionM3 === 2);
  assert.ok(res.allocations[1].consumptionM3 === 10);
  assert.equal(res.summary.distributedTotalBs, 600);
});

test('distributeInvoice: coeficiente inválido por defecto a 1', () => {
  const res = distributeInvoice({
    invoiceBs: 100,
    readings: [{ apartmentId: 1, consumptionM3: 5 }, { apartmentId: 2, consumptionM3: 5 }],
    coefficients: { 1: 0, 2: 'x' },
    pricePerM3: 0,
  });
  assert.equal(res.allocations[0].coefficient, 1);
  assert.equal(res.allocations[1].coefficient, 1);
  assert.equal(res.allocations[0].amountDueBs, 50);
  assert.equal(res.allocations[1].amountDueBs, 50);
});

test('distributeInvoice: errores de validación', () => {
  assert.throws(
    () => distributeInvoice({ invoiceBs: 0, readings: [{ apartmentId: 1, consumptionM3: 5 }] }),
    /mayor que cero/
  );
  assert.throws(
    () => distributeInvoice({ invoiceBs: 100, readings: [{ apartmentId: 1, consumptionM3: 0 }] }),
    /consumo total/
  );
});

test('distributeInvoice: precio por m3 puede ser cero/negativo sin romper reparto', () => {
  const res = distributeInvoice({
    invoiceBs: 500,
    readings: [{ apartmentId: 1, consumptionM3: 5 }],
    coefficients: { 1: 1 },
    pricePerM3: 0,
  });
  assert.equal(res.summary.distributedTotalBs, 500);
  assert.equal(res.allocations[0].baseBs, 0);
});

test('buildBreakdown: estructura completa del desglose', () => {
  const res = distributeInvoice({
    invoiceBs: 1000,
    readings: [{ apartmentId: 1, consumptionM3: 20 }],
    coefficients: { 1: 1 },
    pricePerM3: 7.5,
  });
  const breakdown = JSON.parse(buildBreakdown({
    item: res.allocations[0],
    summary: res.summary,
    periodCode: 'P-2026-01',
    generalTotal: 100,
  }));
  assert.equal(breakdown.period_code, 'P-2026-01');
  assert.equal(breakdown.invoice_bs, 1000);
  assert.equal(breakdown.price_per_m3, 7.5);
  assert.equal(breakdown.common_difference_m3, 80);
  assert.equal(typeof breakdown.base_bs, 'number');
  assert.equal(typeof breakdown.common_share_bs, 'number');
  assert.ok(Object.keys(breakdown).length >= 14, 'desglose completo');
});

test('buildBreakdown: diferencia común sin medidor general', () => {
  const res = distributeInvoice({
    invoiceBs: 100, readings: [{ apartmentId: 1, consumptionM3: 5 }], coefficients: {}, pricePerM3: 0,
  });
  const b = JSON.parse(buildBreakdown({ item: res.allocations[0], summary: res.summary, periodCode: 'P', generalTotal: 0 }));
  assert.equal(b.common_difference_m3, 0);
});

test('computePending: nunca negativo y redondea', () => {
  assert.equal(computePending('100', '40.5'), 59.5);
  assert.equal(computePending(100, 100), 0);
  assert.equal(computePending(50, 200), 0);
  assert.equal(computePending(0, 0), 0);
  assert.equal(computePending('100.77', '5.99'), 94.78);
});