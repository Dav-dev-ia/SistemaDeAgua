from datetime import datetime, UTC

from app.extensions import db
from app.models.apartment import Meter
from app.models.billing import Allocation, BillingPeriod, Reading


def calcular_consumo(previous_reading: float, current_reading: float, is_inverted: bool) -> float:
    consumo = previous_reading - current_reading if is_inverted else current_reading - previous_reading

    if consumo < 0:
        raise ValueError("El consumo no puede ser negativo. Revisa las lecturas del medidor.")

    return round(consumo, 2)


def guardar_lecturas(period: BillingPeriod, readings_payload: list[dict]) -> list[Reading]:
    creadas = []

    for item in readings_payload:
        apartment_id = item.get("apartment_id")
        previous_reading = float(item.get("previous_reading", 0))
        current_reading = float(item.get("current_reading", 0))

        meter = Meter.query.filter_by(apartment_id=apartment_id, is_active=True).first()
        if not meter:
            raise ValueError(f"No existe medidor activo para el departamento {apartment_id}.")

        consumo = calcular_consumo(previous_reading, current_reading, meter.is_inverted)

        reading = Reading.query.filter_by(period_id=period.id, meter_id=meter.id).first()
        if not reading:
            reading = Reading(
                period_id=period.id,
                apartment_id=apartment_id,
                meter_id=meter.id,
                previous_reading=previous_reading,
                current_reading=current_reading,
                consumption_m3=consumo,
                source_json={"source": "manual"},
            )
            db.session.add(reading)
        else:
            reading.previous_reading = previous_reading
            reading.current_reading = current_reading
            reading.consumption_m3 = consumo
            reading.source_json = {"source": "manual", "updated_at": datetime.now(UTC).isoformat()}

        creadas.append(reading)

    db.session.flush()
    return creadas


def liquidar_periodo(period: BillingPeriod) -> dict:
    readings = Reading.query.filter_by(period_id=period.id).all()
    if not readings:
        raise ValueError("No hay lecturas registradas para este periodo.")

    if period.total_common_amount_bs <= 0:
        raise ValueError("Debes registrar el monto total común a repartir en el periodo.")

    total_consumption = round(sum(r.consumption_m3 for r in readings), 2)
    if total_consumption <= 0:
        raise ValueError("El consumo total debe ser mayor que cero para distribuir el pago.")

    Allocation.query.filter_by(period_id=period.id).delete()

    distributed_total = 0
    general_total = float(period.general_total_consumption_m3 or 0)
    common_difference = round(general_total - total_consumption, 2) if general_total > 0 else 0

    resumen = []
    for reading in readings:
        percentage = reading.consumption_m3 / total_consumption
        amount_due = round(period.total_common_amount_bs * percentage, 2)
        distributed_total += amount_due

        allocation = Allocation(
            period_id=period.id,
            apartment_id=reading.apartment_id,
            consumption_m3=reading.consumption_m3,
            percentage_share=round(percentage * 100, 4),
            amount_due_bs=amount_due,
            amount_paid_bs=0,
            status="PENDIENTE",
            breakdown_json={
                "period_code": period.code,
                "consumption_m3": reading.consumption_m3,
                "total_consumption_m3": total_consumption,
                "share_ratio": round(percentage, 8),
                "share_percent": round(percentage * 100, 4),
                "common_total_amount_bs": round(period.total_common_amount_bs, 2),
                "general_total_consumption_m3": general_total,
                "common_difference_m3": common_difference,
            },
        )
        db.session.add(allocation)
        resumen.append(
            {
                "apartment_id": reading.apartment_id,
                "consumption_m3": reading.consumption_m3,
                "percentage_share": round(percentage * 100, 4),
                "amount_due_bs": amount_due,
            }
        )

    ajuste_redondeo = round(period.total_common_amount_bs - distributed_total, 2)
    if ajuste_redondeo != 0 and resumen:
        db.session.flush()
        ultima = Allocation.query.filter_by(period_id=period.id).order_by(Allocation.id.desc()).first()
        ultima.amount_due_bs = round(ultima.amount_due_bs + ajuste_redondeo, 2)
        bd = ultima.breakdown_json or {}
        bd["rounding_adjustment_bs"] = ajuste_redondeo
        ultima.breakdown_json = bd
        distributed_total = round(distributed_total + ajuste_redondeo, 2)

    period.total_individual_consumption_m3 = total_consumption
    period.common_difference_m3 = common_difference
    period.distributed_total_bs = distributed_total
    period.status = "CALCULATED"

    db.session.flush()

    return {
        "period": period.to_dict(),
        "summary": {
            "total_consumption_m3": total_consumption,
            "general_total_consumption_m3": general_total,
            "common_difference_m3": common_difference,
            "distributed_total_bs": distributed_total,
        },
        "allocations": [a.to_dict() for a in Allocation.query.filter_by(period_id=period.id).all()],
    }
