"""
Script de seed: Crea datos demo para el sistema AguaPago.
Ejecutar: cd api && python seed.py
"""
import sys
import os
sys.path.insert(0, os.path.dirname(__file__))

from app import create_app
from app.extensions import db
from app.models.user import User
from app.models.apartment import Apartment, Meter
from app.models.billing import BillingPeriod, Reading, Allocation
from app.services.settlement import guardar_lecturas, liquidar_periodo
import random

app = create_app()

BLOQUES = ["A", "B", "C", "D", "E"]
DPTOS_POR_BLOQUE = 8
NOMBRES = [
    "Juan Pérez", "María Rojas", "Carlos Mendoza", "Ana Gutiérrez",
    "Pedro Sánchez", "Lucía Fernández", "Roberto Vargas", "Elena Morales",
    "Miguel Torres", "Patricia Díaz", "José Ramírez", "Carmen López",
    "Fernando Castro", "Isabel Herrera", "Andrés Flores", "Sofía Paredes",
    "Diego Salazar", "Valentina Cruz", "Ricardo Navarro", "Gabriela Reyes",
    "Héctor Molina", "Laura Ortega", "Felipe Acosta", "Diana Medina",
    "Sergio Campos", "Natalia Ríos", "Pablo Espinoza", "Mariana Aguilar",
    "Raúl Peña", "Claudia Vega", "Alejandro Silva", "Daniela Soto",
    "Eduardo León", "Catalina Ruiz", "Tomás Ibáñez", "Verónica Pinto",
    "Martín Contreras", "Mónica Bravo", "Nicolás Fuentes", "Andrea Jiménez",
]

def seed():
    with app.app_context():
        print("Limpiando base de datos...")
        db.drop_all()
        db.create_all()

        # 1. Admin
        admin = User(username="admin", full_name="Administrador General", role="ADMIN", is_active=True)
        admin.set_password("admin123")
        db.session.add(admin)
        db.session.flush()
        print(f"  Admin creado: admin / admin123")

        # 2. Departamentos con medidores y usuarios
        nombre_idx = 0
        apartments = []
        meter_map = {}
        for bloque in BLOQUES:
            for i in range(1, DPTOS_POR_BLOQUE + 1):
                num = f"{i}01" if i < 10 else f"{i}1"
                nombre = NOMBRES[nombre_idx % len(NOMBRES)]
                nombre_idx += 1

                apt = Apartment(
                    block=bloque,
                    number=num,
                    owner_name=nombre,
                    phone=f"7{random.randint(1000000, 9999999)}",
                    coefficient=1.0,
                    is_active=True,
                )
                db.session.add(apt)
                db.session.flush()

                is_inv = random.random() < 0.1
                meter = Meter(
                    code=f"MED-{bloque}{num}",
                    apartment_id=apt.id,
                    is_inverted=is_inv,
                    is_active=True,
                )
                db.session.add(meter)

                user = User(
                    username=f"{bloque.lower()}{num}",
                    full_name=nombre,
                    role="OWNER",
                    is_active=True,
                    apartment_id=apt.id,
                )
                user.set_password(f"{bloque.lower()}{num}")
                db.session.add(user)

                apartments.append(apt)
                meter_map[apt.id] = is_inv

        db.session.flush()
        print(f"  {len(apartments)} departamentos creados con medidores y usuarios")

        # 3. Periodos con lecturas
        periodos_codes = ["2026-05", "2026-06", "2026-07", "2026-08"]
        for code in periodos_codes:
            total_common = round(random.uniform(8000, 12000), 2)
            general_consumption = round(random.uniform(1100, 1400), 2)

            period = BillingPeriod(
                code=code,
                total_common_amount_bs=total_common,
                general_total_consumption_m3=general_consumption,
                status="OPEN",
            )
            db.session.add(period)
            db.session.flush()

            readings_payload = []
            for apt in apartments:
                consumo = round(random.uniform(3, 18), 2)
                is_inv = meter_map.get(apt.id, False)

                if is_inv:
                    # Invertido: prev > curr (prev - curr = consumo)
                    curr = round(random.uniform(100, 500), 2)
                    prev = round(curr + consumo, 2)
                else:
                    # Normal: curr > prev (curr - prev = consumo)
                    prev = round(random.uniform(100, 500), 2)
                    curr = round(prev + consumo, 2)

                readings_payload.append({
                    "apartment_id": apt.id,
                    "previous_reading": prev,
                    "current_reading": curr,
                })

            guardar_lecturas(period, readings_payload)
            db.session.flush()

            result = liquidar_periodo(period)
            db.session.flush()

            allocations = Allocation.query.filter_by(period_id=period.id).all()
            paid_count = 0
            for alloc in allocations:
                r = random.random()
                if r < 0.5:
                    alloc.amount_paid_bs = alloc.amount_due_bs
                    alloc.status = "PAGADO"
                    paid_count += 1
                elif r < 0.7:
                    alloc.amount_paid_bs = round(alloc.amount_due_bs * random.uniform(0.3, 0.8), 2)
                    alloc.status = "PARCIAL"
                    paid_count += 1

            db.session.flush()
            print(f"  Periodo {code}: {total_common:.2f} Bs, {len(apartments)} lecturas, {paid_count} pagos")

        db.session.commit()
        print("\nSEED COMPLETADO")
        print(f"  - {len(apartments)} departamentos")
        print(f"  - {len(periodos_codes)} periodos con lecturas y pagos")
        print(f"  - Login admin: admin / admin123")
        print(f"  - Login ejemplo: a101 / a101")


if __name__ == "__main__":
    seed()
