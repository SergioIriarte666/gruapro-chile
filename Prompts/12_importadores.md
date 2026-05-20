# Módulo 12 — Importadores (Excel, XML, PDF)
**Sistema de Gestión de Grúas · Claude Code**

---

## Integración cruzada

**XML DTE:** crea `costos` + `supplier_payments` + `supplier_invoices` enlazados (triangular sync).
**Excel:** carga masiva a cualquier módulo del sistema.
**PDF:** extrae datos de OC del cliente para pre-llenar formularios.

---

## Prompt completo para Claude Code

```
Construye los módulos importadores completos: Excel, XML y PDF.
El contexto del proyecto está en CLAUDE.md.

## Librerías requeridas
npm install fast-xml-parser xlsx pdf-lib pdfjs-dist

## IMPORTADOR 1 — Excel (carga masiva)

Crear src/services/ExcelImportService.ts

### Plantillas disponibles (generar y descargar):

GET /api/import/[modulo]/template
Módulos: servicios | costos | clientes | bodega

Para cada plantilla, generar .xlsx con SheetJS (xlsx):
  import * as XLSX from 'xlsx'
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet([
    headers,    // Fila 1: encabezados en negrita
    ejemploRow, // Fila 2: datos de ejemplo reales
    instrRow,   // Fila 3: instrucciones por columna (en gris)
    ...[]       // Filas vacías para completar
  ])

  // Data validation (listas desplegables) para columnas de enum:
  // Cargar valores desde Supabase antes de generar
  // Ej: tipos de servicio, categorías de costo, formas de pago

  // Estilo: encabezados en azul, columnas obligatorias con fondo amarillo
  XLSX.utils.book_append_sheet(wb, ws, 'Datos')
  const buffer = XLSX.write(wb, { type:'buffer', bookType:'xlsx' })
  Descargar con nombre: [modulo]-plantilla-[fecha].xlsx

### Columnas por plantilla:

SERVICIOS: fecha*, cliente_rut*, tipo_servicio*, monto*, forma_pago*,
           folio_cliente, operador_rut, grua_patente, origen, destino, observaciones

COSTOS: fecha*, categoria*, subcategoria*, monto*, tipo*,
        medio_pago, numero_documento, grua_patente, descripcion

CLIENTES: rut*, nombre*, tipo*, email, telefono, direccion, condicion_pago, requiere_folio

BODEGA: nombre_item*, categoria*, cantidad*, precio_costo*, unidad, stock_minimo, proveedor_rut

### Procesador de carga:

POST /api/import/[modulo]
Recibe archivo .xlsx.

1. Parsear con SheetJS (ignorar filas 2 y 3 — ejemplo e instrucciones):
   const wb = XLSX.read(buffer, { type:'array' })
   const ws = wb.Sheets[wb.SheetNames[0]]
   const rows = XLSX.utils.sheet_to_json(ws, { range:3 }) // desde fila 4

2. Validar cada fila:
   a. Campos obligatorios no vacíos
   b. Enums válidos (case-insensitive + trim)
   c. Referencias en Supabase:
      - cliente_rut → buscar en clientes.rut
      - operador_rut → buscar en operadores.rut
      - grua_patente → buscar en gruas.patente
   d. Fechas con formato válido
   e. Números positivos donde corresponda

3. Separar filas OK vs filas con error:
   Filas OK: { rowIndex, data: ParsedRow }
   Filas error: { rowIndex, field, error: string }

4. Importar filas OK (batch insert en Supabase):
   supabase.from(tabla).insert(filasOK.map(f => f.data))

5. Generar Excel con solo las filas erróneas:
   XLSX.utils.book_new() con: fila original + columna "Error" al final
   Descargar como: [modulo]-errores-[fecha].xlsx

6. Retornar:
   { total, importadas, errores: [{fila, campo, descripcion}], errorFileBase64 }

### Componente ExcelImporter — src/components/shared/ExcelImporter.tsx

Props: modulo ('servicios'|'costos'|'clientes'|'bodega')

UI:
  1. Botón "Descargar plantilla" → GET /api/import/[modulo]/template
  2. Zona drag & drop para subir el archivo completado
  3. Progress bar durante la validación
  4. Resultado:
     ✓ N filas listas para importar
     ✗ M filas con errores (tabla de errores: fila | campo | descripción)
  5. Botón "Importar filas correctas" (si hay filas OK)
  6. Botón "Descargar filas con error" (si hay errores) → para corregir y re-subir

## IMPORTADOR 2 — XML DTE del SII

Crear src/services/XMLImportService.ts
(Implementación completa en la Sección 5.4 del documento principal de prompts)

Componente XMLImporter — src/components/shared/XMLImporter.tsx

UI:
  1. Zona drag & drop (acepta múltiples archivos XML)
  2. Lista de archivos subidos con estado: procesando | listo | error | duplicado
  3. Para cada archivo → preview con tabla de campos extraídos:
     Campo | Valor extraído | Confianza
     ----- | -------------- | ---------
     Proveedor (RUT) | 96.801.450-6 · Copec S.A. | 🟢 Alta
     N° Folio DTE | 00429841 | 🟢 Alta
     Fecha emisión | 30/04/2025 | 🟢 Alta
     Monto neto | $284.034 | 🟢 Alta
     Categoría sugerida | Combustible → Diésel | 🟡 Revisar
     Grúa asociada | (asignar manualmente) | 🔴 Requerido
  4. Campos editables antes de confirmar
  5. Botón "Importar" por archivo o "Importar todos los listos"

## IMPORTADOR 3 — PDF (OC y cotizaciones del cliente)

Crear src/services/PDFImportService.ts
Librería: pdfjs-dist para extraer texto

async extractFromPDF(file: File): Promise<{
  fields: { key: string, value: string, confidence: 'high'|'medium'|'low' }[]
  rawText: string
}>

Extracción del texto:
  import * as pdfjsLib from 'pdfjs-dist'
  const doc = await pdfjsLib.getDocument({ data: buffer }).promise
  const texts = []
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i)
    const content = await page.getTextContent()
    texts.push(content.items.map(i => i.str).join(' '))
  }
  const fullText = texts.join('\n')

Patrones de extracción (regex sobre fullText):
  numeroOC: /(?:N[°º]?\s*OC|Orden\s+de\s+Compra)[:\s]+([A-Z0-9\-]+)/i
  rut: /RUT[:\s]+(\d{1,2}\.\d{3}\.\d{3}-[\dkK])/i
  monto: /(?:Total|Monto)[:\s]+\$?([\d.,]+)/i
  fecha: /(?:Fecha)[:\s]+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i
  periodo: /(?:período|mes)[:\s]+([A-Za-záéíóúÁÉÍÓÚ]+\s+\d{4})/i

Nivel de confianza:
  Alta: campo encontrado con patrón claro y valor parseable
  Media: campo encontrado pero valor ambiguo
  Baja: campo no encontrado

Sugerir cierre vinculado:
  Si se detecta cliente + período → buscar cierre:
  supabase.from('cierres')
    .select('id,numero,estado')
    .eq('cliente_id', clienteDetectadoId)
    .eq('estado', ['abierto','enviado'])
    // Filtrar por período detectado

Componente PDFImporter — src/components/shared/PDFImporter.tsx

Usado en el módulo de OC (para subir la OC del cliente y pre-llenar el formulario).

UI:
  1. Zona upload de PDF
  2. Indicador "Analizando documento..." mientras extrae
  3. Preview de campos con colores de confianza
  4. Campos editables para confirmar/corregir
  5. Si se detectó cierre → botón "Vincular con CIE-XXXX"
  6. Botón "Confirmar y crear OC" → POST /api/ordenes-compra con datos confirmados

## Página de importaciones — src/app/(dashboard)/importar/page.tsx

Tabs: Excel | XML DTE | PDF
Cada tab muestra el componente correspondiente.
Historial de importaciones recientes (últimas 10):
  supabase.from('service_change_history')
    .select('*').in('action',['dte_imported','excel_imported','pdf_imported'])
    .order('created_at', { ascending: false }).limit(10)

## Criterios de aceptación
- [ ] El importador Excel valida y separa filas correctas vs erróneas
- [ ] Las filas con error se pueden descargar como Excel para corregir
- [ ] El XML DTE crea los 3 registros enlazados (costo + pago + factura)
- [ ] La detección de duplicados DTE funciona correctamente
- [ ] El PDF extrae los campos principales de una OC estándar
- [ ] El preview muestra nivel de confianza por campo
- [ ] Nunca se guarda nada sin confirmación del usuario
```
