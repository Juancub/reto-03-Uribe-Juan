---
name: ordenes-compra
description: "Conocimiento de negocio sobre el proceso de compras, catálogo de maestros, matriz de reglas de control RC1-RC10 y gestión de órdenes retroactivas en Periferia IT Group."
---

# Base de Conocimiento: Proceso de Órdenes de Compra en Periferia IT Group

## 1. Contexto Operativo
En Periferia IT Group, cada solicitud de compra recibida en administración debe pasar por un ciclo de control antes de convertirse en una Orden de Compra (OC) oficial en SAP ERP.

### Paquete Documental Obligatorio
1. **Solicitud de Compra (`solicitud.json`)**: Detalla el bien o servicio, cantidad, valor unitario, centro de costos y subárea imputada.
2. **Cotización del Proveedor (`cotizacion.txt`)**: Documento comercial emitido por el proveedor con desglose de precios, validez y condiciones.
3. **Correo de Aprobación (`aprobacion.json`)**: Correo electrónico del líder responsable del centro de costo confirmando expresamente la autorización ("Aprobado").
4. **Factura de Venta (`factura.txt`)**: Opcional. Su presencia previa a la solicitud denota un proceso retroactivo.

---

## 2. Catálogos Maestros de SAP
- **Proveedores (`proveedores.json`)**: Contiene código de acreedor SAP, NIT, razón social, condiciones de pago predeterminadas e indicador de IVA default. Solo proveedores con estado `activo: true` pueden recibir órdenes.
- **Centros de Costo (`centros-costo.json`)**: Estructura de imputación organizativa (ej. `CC-1010` Tecnología, `CC-2020` Administración, `CC-3030` Comercial). Cada centro define sus subáreas válidas y una matriz de líderes aprobadores con topes monetarios máximos.
- **Indicadores de IVA (`indicadores-iva.json`)**: `C1` (IVA 19%), `C2` (IVA 5%), `C0` (Excluido/no gravado).
- **Condiciones de Pago (`condiciones-pago.json`)**: Días de crédito pactados (`Z000`, `Z015`, `Z030`, `Z060`).

---

## 3. Matriz de Reglas de Control (RC1–RC10)
| Regla | Descripción | Tipo | Consecuencia |
|---|---|---|---|
| **RC1** | Proveedor registrado y activo en SAP | Bloqueo | No se crea OC. Devolver para creación o activación de proveedor. |
| **RC2** | Aprobación explícita de aprobador del centro de costo | Bloqueo | No se crea OC. Correo debe pertenecer al centro de costo. |
| **RC3** | Valor total ≤ Tope monetario del aprobador | Bloqueo | No se crea OC. Solicitar aprobación de nivel superior. |
| **RC4** | Subárea válida dentro del centro de costo | Bloqueo | No se crea OC. Corregir imputación contable. |
| **RC5** | Diferencia cotización vs solicitud ≤ 2% | Confirmación | Analista debe autorizar la discrepancia de precio. |
| **RC6** | Indicador de IVA ausente | Confirmación | Se deriva default del proveedor y se solicita confirmación. |
| **RC7** | Condiciones de pago ausente | Derivado | Se asume default del proveedor y se informa en el payload. |
| **RC8** | Factura emitida antes de fecha de solicitud | Confirmación | Marcada como **OC RETROACTIVA** en auditoría. |
| **RC9** | Fecha de aprobación posterior o igual a solicitud | Confirmación | Verificar por qué se aprobó antes de formalizar solicitud. |
| **RC10** | Consistencia aritmética (Cant × Unitario = Total) | Bloqueo | Error en digitación o cálculo de la solicitud. |
