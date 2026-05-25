import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  Coins,
  FileText,
  RotateCw,
  Search,
  Truck,
} from "lucide-react";

import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { VehiculoSelector } from "@/components/shared/vehiculo-selector";
import type { ReactNode } from "react";
import type { Tables, TablesInsert } from "@/integrations/supabase/types";
import { formatCLP } from "@/lib/format";
import { FORMA_PAGO_OPTIONS, TIPO_SERVICIO_OPTIONS } from "@/lib/ordenes-options";
import {
  getCurrentChileDateString,
  getCurrentChileDateTimeLocal,
  safeParseDateOnly,
} from "@/lib/business-clock";

type Cliente = Pick<Tables<"clientes">, "id" | "nombre" | "rut">;
type Grua = Pick<Tables<"gruas">, "id" | "patente" | "marca" | "modelo">;
type Operador = Pick<Tables<"operadores">, "id" | "nombre">;
type CategoriaCosto = Pick<Tables<"categorias_costo">, "id" | "nombre" | "tipo" | "activa">;
type SubcategoriaCosto = Pick<
  Tables<"subcategorias_costo">,
  "id" | "nombre" | "categoria_id" | "aplica_a" | "activa"
>;
type Proveedor = Pick<Tables<"proveedores">, "id" | "nombre">;
type BodegaItem = Pick<
  Tables<"bodega_items">,
  "id" | "nombre" | "precio_costo" | "stock_actual" | "unidad"
>;

type OperatorDraft = {
  id: string;
  operatorId: string;
  role: "principal" | "asistente";
  hours: string;
  commission: string;
};

type CostDraft = {
  id: string;
  categoria_id: string;
  subcategoria_id: string;
  descripcion: string;
  cantidad: string;
  precio_unitario: string;
  notas: string;
};

type ProductDraft = {
  id: string;
  item_id: string;
  cantidad: string;
  precio_unitario: string;
  descuento: string;
};

const STEP_META = [
  { id: 1, label: "Identificación y fechas", icon: FileText },
  { id: 2, label: "Cliente y vehículo", icon: Truck },
  { id: 3, label: "Recursos y costos", icon: Coins },
  { id: 4, label: "Valores y resumen", icon: CalendarDays },
] as const;

const ORDER_STATES = [
  { value: "pendiente", label: "Pendiente" },
  { value: "en_curso", label: "En curso" },
  { value: "completado", label: "Completado" },
  { value: "anulado", label: "Cancelado" },
  { value: "facturado", label: "Facturado" },
] as const;

const optionalNumber = z.preprocess(
  (value) => (value === "" || value == null ? undefined : Number(value)),
  z.number().min(0).optional(),
);

const enhancedServiceFormSchema = z
  .object({
    folio_interno: z
      .string()
      .trim()
      .min(3, "El folio debe tener al menos 3 caracteres")
      .regex(/^[A-Za-z0-9\-_]+$/, "Usa solo letras, números, guion y guion bajo"),
    request_date: z.string().min(1, "La fecha de solicitud es obligatoria"),
    service_date: z.string().min(1, "La fecha de servicio es obligatoria"),
    start_time: z.string().optional().or(z.literal("")),
    end_time: z.string().optional().or(z.literal("")),
    crane_mileage: optionalNumber,
    cliente_id: z.string().min(1, "Selecciona un cliente"),
    cliente_vehiculo_id: z.string().optional().or(z.literal("")),
    tipo_servicio: z.string().min(1, "Selecciona un tipo de servicio"),
    purchase_order: z.string().trim().max(100).optional().or(z.literal("")),
    quote_number: z.string().trim().max(100).optional().or(z.literal("")),
    insured_name: z.string().trim().max(120).optional().or(z.literal("")),
    vehicle_brand: z.string().trim().max(100).optional().or(z.literal("")),
    vehicle_model: z.string().trim().max(100).optional().or(z.literal("")),
    license_plate: z.string().trim().max(12).optional().or(z.literal("")),
    vin: z.string().trim().max(17).optional().or(z.literal("")),
    origen: z.string().trim().min(1, "El origen es obligatorio").max(255),
    destino: z.string().trim().min(1, "El destino es obligatorio").max(255),
    grua_id: z.string().optional().or(z.literal("")),
    forma_pago: z.string().optional().or(z.literal("")),
    value: z.preprocess((value) => Number(value ?? 0), z.number().min(0)),
    has_excess: z.boolean().default(false),
    client_covered_amount: z.preprocess((value) => Number(value ?? 0), z.number().min(0)),
    observations: z.string().trim().max(4000).optional().or(z.literal("")),
    estado: z.enum(["pendiente", "en_curso", "completado", "anulado", "facturado"]),
    outsourced_enabled: z.boolean().default(false),
    outsourced_provider_id: z.string().optional().or(z.literal("")),
    outsourced_cost: z.preprocess((value) => Number(value ?? 0), z.number().min(0)),
    outsourced_notes: z.string().trim().max(1000).optional().or(z.literal("")),
    custody_enabled: z.boolean().default(false),
    custody_vehicle_type: z.string().trim().max(100).optional().or(z.literal("")),
    custody_days: optionalNumber,
    custody_daily_rate: optionalNumber,
    custody_notes: z.string().trim().max(1000).optional().or(z.literal("")),
  })
  .superRefine((data, ctx) => {
    if (data.start_time && data.end_time && data.end_time < data.start_time) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["end_time"],
        message: "La hora fin debe ser mayor o igual a la hora inicio",
      });
    }
    if (data.has_excess && data.client_covered_amount > data.value) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["client_covered_amount"],
        message: "Lo cubierto por cliente no puede superar el valor del servicio",
      });
    }
  });

type EnhancedServiceFormInput = z.input<typeof enhancedServiceFormSchema>;
type EnhancedServiceFormValues = z.output<typeof enhancedServiceFormSchema>;

interface Props {
  onCancel: () => void;
  onCreated: (ordenId: string) => void;
  initialClienteId?: string;
}

function amountFromParts(cantidad: string, precio: string, descuento = "0") {
  const qty = Number(cantidad || 0);
  const unit = Number(precio || 0);
  const discount = Number(descuento || 0);
  const base = qty * unit;
  return Math.max(0, Math.round(base * (1 - discount / 100)));
}

function createDraftId() {
  return typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `draft-${Math.random().toString(36).slice(2, 10)}`;
}

function stepErrorMessage(label: string, message: string) {
  return `${label}: ${message}`;
}

function buildOperationalNotes(
  values: EnhancedServiceFormValues,
  operators: OperatorDraft[],
  costs: CostDraft[],
  products: ProductDraft[],
) {
  const lines = [
    values.observations?.trim() || "",
    "",
    "=== Detalle operativo ===",
    `Fecha solicitud: ${values.request_date || "—"}`,
    `Hora inicio: ${values.start_time || "—"}`,
    `Hora fin: ${values.end_time || "—"}`,
    `Kilometraje grúa: ${values.crane_mileage ?? "—"}`,
    `Asegurado: ${values.insured_name || "—"}`,
    `Patente: ${(values.license_plate || "").toUpperCase() || "—"}`,
    `VIN: ${values.vin || "—"}`,
    `Custodia: ${values.custody_enabled ? "Sí" : "No"}`,
  ];

  const extraOperators = operators.flatMap((operator, index) =>
    operator.role === "asistente" && operator.operatorId
      ? [
          `Asistente ${index + 1}: ${operator.operatorId} · ${operator.hours || "0"} h · comisión ${operator.commission || "0"}`,
        ]
      : [],
  );

  if (extraOperators.length > 0) {
    lines.push(...extraOperators);
  }

  if (costs.length > 0) {
    lines.push(`Costos planificados: ${costs.length}`);
  }
  if (products.length > 0) {
    lines.push(`Ítems de inventario: ${products.length}`);
  }

  return lines.filter(Boolean).join("\n");
}

async function generateUniqueFolio(date: string) {
  const day = date.replaceAll("-", "");
  const prefix = `SRV-${day}-`;
  const { data, error } = await supabase
    .from("ordenes_servicio")
    .select("folio_interno")
    .ilike("folio_interno", `${prefix}%`)
    .order("folio_interno", { ascending: false });
  if (error) throw error;

  const used = new Set(
    (data ?? []).reduce<string[]>((acc, row) => {
      if (row.folio_interno) acc.push(row.folio_interno);
      return acc;
    }, []),
  );
  let counter = Math.max(1, used.size + 1);
  let candidate = `${prefix}${String(counter).padStart(4, "0")}`;

  while (used.has(candidate)) {
    counter += 1;
    candidate = `${prefix}${String(counter).padStart(4, "0")}`;
  }
  return candidate;
}

function SectionCard({
  title,
  description,
  tone,
  children,
}: {
  title: string;
  description?: string;
  tone: "violet" | "blue" | "amber";
  children: ReactNode;
}) {
  const toneClass =
    tone === "violet"
      ? "border-violet-200 bg-violet-50/30"
      : tone === "blue"
        ? "border-sky-200 bg-sky-50/30"
        : "border-amber-200 bg-amber-50/30";

  return (
    <Card className={toneClass}>
      <CardHeader className="pb-3">
        <CardTitle className="text-base">{title}</CardTitle>
        {description ? <div className="text-sm text-muted-foreground">{description}</div> : null}
      </CardHeader>
      <CardContent className="space-y-4">{children}</CardContent>
    </Card>
  );
}

export function NuevaOrdenWizard({ onCancel, onCreated, initialClienteId }: Props) {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [clientSearch, setClientSearch] = useState("");
  const [manualFolio, setManualFolio] = useState(false);
  const [folioStatus, setFolioStatus] = useState<"idle" | "checking" | "available" | "taken">("idle");
  const [stepError, setStepError] = useState("");
  const [operators, setOperators] = useState<OperatorDraft[]>([
    { id: createDraftId(), operatorId: "", role: "principal", hours: "", commission: "" },
  ]);
  const [costs, setCosts] = useState<CostDraft[]>([]);
  const [products, setProducts] = useState<ProductDraft[]>([]);

  const isClienteLocked = !!initialClienteId;

  const form = useForm<EnhancedServiceFormInput, unknown, EnhancedServiceFormValues>({
    resolver: zodResolver(enhancedServiceFormSchema),
    defaultValues: {
      folio_interno: "",
      request_date: getCurrentChileDateString(),
      service_date: getCurrentChileDateString(),
      start_time: getCurrentChileDateTimeLocal().slice(11, 16),
      end_time: "",
      crane_mileage: undefined,
      cliente_id: initialClienteId ?? "",
      cliente_vehiculo_id: "",
      tipo_servicio: "",
      purchase_order: "",
      quote_number: "",
      insured_name: "",
      vehicle_brand: "",
      vehicle_model: "",
      license_plate: "",
      vin: "",
      origen: "",
      destino: "",
      grua_id: "",
      forma_pago: "",
      value: 0,
      has_excess: false,
      client_covered_amount: 0,
      observations: "",
      estado: "pendiente",
      outsourced_enabled: false,
      outsourced_provider_id: "",
      outsourced_cost: 0,
      outsourced_notes: "",
      custody_enabled: false,
      custody_vehicle_type: "",
      custody_days: undefined,
      custody_daily_rate: undefined,
      custody_notes: "",
    },
  });

  const values = form.watch();
  const selectedClientId = values.cliente_id;

  const { data: clientes = [] } = useQuery({
    queryKey: ["clientes", "selector-enhanced-services"],
    queryFn: async (): Promise<Cliente[]> => {
      const { data, error } = await supabase
        .from("clientes")
        .select("id,nombre,rut")
        .order("nombre");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: gruas = [] } = useQuery({
    queryKey: ["gruas", "activas", "enhanced-services"],
    queryFn: async (): Promise<Grua[]> => {
      const { data, error } = await supabase
        .from("gruas")
        .select("id,patente,marca,modelo")
        .eq("estado", "activa")
        .order("patente");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: operadores = [] } = useQuery({
    queryKey: ["operadores", "activos", "enhanced-services"],
    queryFn: async (): Promise<Operador[]> => {
      const { data, error } = await supabase
        .from("operadores")
        .select("id,nombre")
        .eq("estado", "activo")
        .order("nombre");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: categorias = [] } = useQuery({
    queryKey: ["categorias-costo", "enhanced-services"],
    queryFn: async (): Promise<CategoriaCosto[]> => {
      const { data, error } = await supabase.from("categorias_costo").select("id,nombre,tipo,activa");
      if (error) throw error;
      return (data ?? []).filter((row) => row.activa !== false) as CategoriaCosto[];
    },
  });

  const { data: subcategorias = [] } = useQuery({
    queryKey: ["subcategorias-costo", "enhanced-services"],
    queryFn: async (): Promise<SubcategoriaCosto[]> => {
      const { data, error } = await supabase
        .from("subcategorias_costo")
        .select("id,nombre,categoria_id,aplica_a,activa");
      if (error) throw error;
      return (data ?? []).filter((row) => row.activa !== false) as SubcategoriaCosto[];
    },
  });

  const { data: proveedores = [] } = useQuery({
    queryKey: ["proveedores", "enhanced-services"],
    queryFn: async (): Promise<Proveedor[]> => {
      const { data, error } = await supabase.from("proveedores").select("id,nombre").order("nombre");
      if (error) throw error;
      return data ?? [];
    },
  });

  const { data: items = [] } = useQuery({
    queryKey: ["bodega-items", "enhanced-services"],
    queryFn: async (): Promise<BodegaItem[]> => {
      const { data, error } = await supabase
        .from("bodega_items")
        .select("id,nombre,precio_costo,stock_actual,unidad")
        .order("nombre");
      if (error) throw error;
      return data ?? [];
    },
  });

  const selectedClient = useMemo(
    () => clientes.find((client) => client.id === selectedClientId) ?? null,
    [clientes, selectedClientId],
  );
  const itemMap = useMemo(() => new Map(items.map((item) => [item.id, item] as const)), [items]);

  const filteredClientes = useMemo(() => {
    if (isClienteLocked) return clientes.filter((client) => client.id === selectedClientId);
    const term = clientSearch.trim().toLowerCase();
    if (!term) return clientes.slice(0, 50);
    return clientes
      .filter(
        (client) =>
          client.nombre.toLowerCase().includes(term) ||
          (client.rut ?? "").toLowerCase().includes(term),
      )
      .slice(0, 50);
  }, [clientSearch, clientes, isClienteLocked, selectedClientId]);

  useEffect(() => {
    if (manualFolio) return;
    let active = true;
    generateUniqueFolio(values.request_date || getCurrentChileDateString())
      .then((folio) => {
        if (!active) return;
        form.setValue("folio_interno", folio, { shouldValidate: true });
        setFolioStatus("available");
      })
      .catch(() => {
        if (!active) return;
        setFolioStatus("idle");
      });
    return () => {
      active = false;
    };
  }, [form, manualFolio, values.request_date]);

  useEffect(() => {
    if (!manualFolio) return;
    const folio = values.folio_interno?.trim();
    if (!folio || folio.length < 3) {
      setFolioStatus("idle");
      return;
    }
    setFolioStatus("checking");
    const handle = window.setTimeout(async () => {
      const { count, error } = await supabase
        .from("ordenes_servicio")
        .select("id", { count: "exact", head: true })
        .eq("folio_interno", folio);
      if (error) {
        setFolioStatus("idle");
        return;
      }
      setFolioStatus((count ?? 0) > 0 ? "taken" : "available");
    }, 400);
    return () => window.clearTimeout(handle);
  }, [manualFolio, values.folio_interno]);

  const totalCommissions = useMemo(
    () => operators.reduce((sum, operator) => sum + Number(operator.commission || 0), 0),
    [operators],
  );

  const totalCosts = useMemo(
    () => costs.reduce((sum, cost) => sum + amountFromParts(cost.cantidad, cost.precio_unitario), 0),
    [costs],
  );

  const totalProducts = useMemo(
    () =>
      products.reduce(
        (sum, product) =>
          sum + amountFromParts(product.cantidad, product.precio_unitario, product.descuento),
        0,
      ),
    [products],
  );

  const custodyTotal = useMemo(() => {
    if (!values.custody_enabled) return 0;
    return Number(values.custody_days ?? 0) * Number(values.custody_daily_rate ?? 0);
  }, [values.custody_daily_rate, values.custody_days, values.custody_enabled]);

  const excessAmount = values.has_excess
    ? Math.max(0, Number(values.value || 0) - Number(values.client_covered_amount || 0))
    : 0;
  const margin =
    Number(values.value || 0) -
    totalCosts -
    totalCommissions -
    Number(values.outsourced_cost || 0);

  async function validateStep(targetStep: 1 | 2 | 3 | 4) {
    setStepError("");
    if (targetStep === 1) {
      const valid = await form.trigger(["folio_interno", "request_date", "service_date", "start_time", "end_time"]);
      if (!valid) return false;
      if (manualFolio && folioStatus === "taken") {
        setStepError(stepErrorMessage("Folio", "El folio manual ya está ocupado"));
        return false;
      }
      return true;
    }

    if (targetStep === 2) {
      return form.trigger(["cliente_id", "tipo_servicio", "origen", "destino"]);
    }

    if (targetStep === 3) {
      const valid = await form.trigger(["grua_id", "outsourced_cost", "outsourced_provider_id"]);
      if (!valid) return false;
      const principal = operators.find((operator) => operator.role === "principal" && operator.operatorId);
      if (!values.grua_id) {
        setStepError(stepErrorMessage("Grúa", "Selecciona una grúa activa"));
        return false;
      }
      if (!principal) {
        setStepError(stepErrorMessage("Operadores", "Debes definir al menos un operador principal"));
        return false;
      }
      if (values.outsourced_enabled && !values.outsourced_provider_id) {
        setStepError(stepErrorMessage("Subcontratación", "Selecciona el proveedor tercero"));
        return false;
      }
      return true;
    }

    return form.trigger(["value", "client_covered_amount", "estado", "observations"]);
  }

  const createMutation = useMutation({
    mutationFn: async (data: EnhancedServiceFormValues) => {
      const principal =
        operators.find((operator) => operator.role === "principal" && operator.operatorId) ?? operators[0];
      const payload: TablesInsert<"ordenes_servicio"> = {
        cliente_id: data.cliente_id,
        cliente_vehiculo_id: data.cliente_vehiculo_id || null,
        grua_id: data.grua_id || null,
        operador_id: principal?.operatorId || null,
        tipo_servicio: data.tipo_servicio,
        origen: data.origen,
        destino: data.destino,
        fecha_servicio: safeParseDateOnly(data.service_date, data.start_time || "00:00"),
        monto: Number(data.value || 0) + custodyTotal + totalProducts,
        forma_pago: data.forma_pago || null,
        folio_cliente: data.purchase_order || null,
        folio_siniestro: data.quote_number || null,
        folio_interno: data.folio_interno,
        observaciones: buildOperationalNotes(data, operators, costs, products),
        estado: data.estado,
      };

      const { data: created, error } = await supabase
        .from("ordenes_servicio")
        .insert(payload)
        .select("id")
        .single();
      if (error) throw error;

      const serviceId = created.id;

      const costoRows: TablesInsert<"costos">[] = costs.map((cost) => ({
        fecha: data.service_date,
        tipo: "servicio" as const,
        orden_id: serviceId,
        grua_id: data.grua_id || null,
        categoria_id: cost.categoria_id,
        subcategoria_id: cost.subcategoria_id,
        monto: amountFromParts(cost.cantidad, cost.precio_unitario),
        descripcion: [cost.descripcion, cost.notas].filter(Boolean).join(" · ") || null,
      }));

      if (data.outsourced_enabled && Number(data.outsourced_cost || 0) > 0) {
        costoRows.push({
          fecha: data.service_date,
          tipo: "servicio",
          orden_id: serviceId,
          grua_id: data.grua_id || null,
          categoria_id: null,
          subcategoria_id: null,
          monto: Number(data.outsourced_cost || 0),
          descripcion: `Subcontratación${data.outsourced_notes ? ` · ${data.outsourced_notes}` : ""}`,
          proveedor_id: data.outsourced_provider_id || null,
        } as TablesInsert<"costos">);
      }

      if (costoRows.length > 0) {
        const { error: costosError } = await supabase.from("costos").insert(costoRows);
        if (costosError) throw costosError;
      }

      const movementRows = products.flatMap((product) => {
        const qty = Number(product.cantidad || 0);
        if (!product.item_id || qty <= 0) return [];
        const item = itemMap.get(product.item_id);
        const available = Number(item?.stock_actual ?? 0);
        if (qty > available) {
          throw new Error(`Stock insuficiente para ${item?.nombre ?? "el ítem seleccionado"}`);
        }
        return [
          {
            item_id: product.item_id,
            tipo: "salida" as const,
            cantidad: qty,
            fecha: data.service_date,
            grua_id: data.grua_id || null,
            orden_id: serviceId,
            descripcion: `Salida por servicio ${data.folio_interno}`,
          },
        ];
      });

      if (movementRows.length > 0) {
        const { error: movementError } = await supabase.from("bodega_movimientos").insert(movementRows);
        if (movementError) throw movementError;
      }

      await (supabase as any).from("service_change_history").insert({
        entity_type: "orden",
        entity_id: serviceId,
        action: "created",
        new_value: {
          ...payload,
          total_comisiones: totalCommissions,
          total_costos: totalCosts,
          total_productos: totalProducts,
        },
      });

      return created;
    },
    onSuccess: (created) => {
      toast.success("Orden creada");
      queryClient.invalidateQueries({ queryKey: ["ordenes"] });
      queryClient.invalidateQueries({ queryKey: ["costos"] });
      queryClient.invalidateQueries({ queryKey: ["bodega"] });
      onCreated(created.id);
    },
    onError: (error: Error) => {
      toast.error(error.message);
    },
  });

  function addOperator() {
    setOperators((prev) => [
      ...prev,
      { id: createDraftId(), operatorId: "", role: "asistente", hours: "", commission: "" },
    ]);
  }

  function nextStep() {
    validateStep(step).then((valid) => {
      if (!valid) return;
      setStep((prev) => Math.min(4, prev + 1) as 1 | 2 | 3 | 4);
    });
  }

  function previousStep() {
    setStep((prev) => Math.max(1, prev - 1) as 1 | 2 | 3 | 4);
  }

  return (
    <Form {...form}>
      <form
        onSubmit={form.handleSubmit(async (data) => {
          const valid = await validateStep(4);
          if (!valid) return;
          await createMutation.mutateAsync(data);
        })}
        className="space-y-6"
      >
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-lg font-semibold">EnhancedServiceForm</div>
              <div className="text-sm text-muted-foreground">
                Crea servicios con folio, recursos, costos e inventario vinculados.
              </div>
            </div>
            <Badge className="bg-violet-600 text-white hover:bg-violet-600">{values.estado}</Badge>
          </div>

          <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-4">
              <Card>
                <CardContent className="pt-6 space-y-4">
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-sm font-medium">Navegación</div>
                    <div className="text-sm text-muted-foreground">Paso {step} de 4</div>
                  </div>
                  <div className="h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-violet-600 transition-all"
                      style={{ width: `${(step / 4) * 100}%` }}
                    />
                  </div>
                  <div className="grid gap-2 md:grid-cols-4">
                    {STEP_META.map((meta) => {
                      const Icon = meta.icon;
                      const active = meta.id === step;
                      const done = meta.id < step;
                      return (
                        <button
                          key={meta.id}
                          type="button"
                          onClick={() => setStep(meta.id)}
                          className={`rounded-lg border px-3 py-3 text-left transition ${
                            active
                              ? "border-violet-300 bg-violet-50"
                              : done
                                ? "border-violet-200 bg-violet-50/40"
                                : "border-border"
                          }`}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className={`grid h-8 w-8 place-items-center rounded-full text-sm ${
                                active || done
                                  ? "bg-violet-600 text-white"
                                  : "bg-muted text-muted-foreground"
                              }`}
                            >
                              {done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                            </span>
                            <div className="text-sm font-medium">{meta.label}</div>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {stepError ? (
                <Card className="border-destructive/30">
                  <CardContent className="pt-6 text-sm text-destructive">{stepError}</CardContent>
                </Card>
              ) : null}

              {step === 1 ? (
                <>
                  <SectionCard title="Folio" tone="violet" description="Generación automática con opción manual.">
                    <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
                      <div>
                        <Label>Folio *</Label>
                        <Input
                          {...form.register("folio_interno")}
                          disabled={!manualFolio}
                          className="font-mono"
                        />
                        <FieldError message={form.formState.errors.folio_interno?.message} />
                      </div>
                      <div className="flex items-end gap-2">
                        <div className="flex items-center gap-2 rounded-md border px-3 py-2">
                          <Switch checked={manualFolio} onCheckedChange={setManualFolio} />
                          <span className="text-sm">Folio manual</span>
                        </div>
                        {!manualFolio ? (
                          <Button
                            type="button"
                            variant="outline"
                            onClick={async () => {
                              const nextFolio = await generateUniqueFolio(values.request_date);
                              form.setValue("folio_interno", nextFolio, { shouldValidate: true });
                            }}
                          >
                            <RotateCw className="mr-2 h-4 w-4" />
                            Regenerar
                          </Button>
                        ) : null}
                      </div>
                    </div>
                    <FolioBadge status={folioStatus} />
                  </SectionCard>

                  <SectionCard title="Fechas" tone="blue" description="Fuente única basada en America/Santiago.">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <Label>Fecha solicitud *</Label>
                        <Input type="date" {...form.register("request_date")} />
                        <FieldError message={form.formState.errors.request_date?.message} />
                      </div>
                      <div>
                        <Label>Fecha servicio *</Label>
                        <Input type="date" {...form.register("service_date")} />
                        <FieldError message={form.formState.errors.service_date?.message} />
                      </div>
                      <div>
                        <Label>Hora inicio</Label>
                        <Input type="time" {...form.register("start_time")} />
                      </div>
                      <div>
                        <Label>Hora fin</Label>
                        <Input type="time" {...form.register("end_time")} />
                        <FieldError message={form.formState.errors.end_time?.message} />
                      </div>
                      <div>
                        <Label>Kilometraje grúa</Label>
                        <Input type="number" min={0} {...form.register("crane_mileage")} />
                      </div>
                    </div>
                  </SectionCard>
                </>
              ) : null}

              {step === 2 ? (
                <>
                  <SectionCard title="Cliente y servicio" tone="violet">
                    <div className="grid gap-4 md:grid-cols-2">
                      {!isClienteLocked ? (
                        <div className="md:col-span-2">
                          <Label>Buscar cliente</Label>
                          <div className="relative">
                            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                            <Input
                              value={clientSearch}
                              onChange={(event) => setClientSearch(event.target.value)}
                              placeholder="Nombre o RUT..."
                              className="pl-8"
                            />
                          </div>
                        </div>
                      ) : null}
                      <div>
                        <Label>Cliente *</Label>
                        <Select
                          value={values.cliente_id}
                          onValueChange={(value) => {
                            form.setValue("cliente_id", value, { shouldValidate: true });
                            resetVehicleFields(form);
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona cliente" />
                          </SelectTrigger>
                          <SelectContent>
                            {filteredClientes.map((client) => (
                              <SelectItem key={client.id} value={client.id}>
                                {client.nombre} {client.rut ? `· ${client.rut}` : ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FieldError message={form.formState.errors.cliente_id?.message} />
                      </div>
                      <div>
                        <Label>Tipo de servicio *</Label>
                        <Select
                          value={values.tipo_servicio}
                          onValueChange={(value) => form.setValue("tipo_servicio", value, { shouldValidate: true })}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona" />
                          </SelectTrigger>
                          <SelectContent>
                            {TIPO_SERVICIO_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FieldError message={form.formState.errors.tipo_servicio?.message} />
                      </div>
                      <div>
                        <Label>Orden de compra</Label>
                        <Input {...form.register("purchase_order")} placeholder="OC-XXXX" />
                      </div>
                      <div>
                        <Label>Cotización</Label>
                        <Input {...form.register("quote_number")} placeholder="COT-XXXX" />
                      </div>
                      <div className="md:col-span-2">
                        <Label>Asegurado</Label>
                        <Input {...form.register("insured_name")} placeholder="Nombre del asegurado" />
                      </div>
                    </div>
                  </SectionCard>

                  <SectionCard title="Vehículo y ubicaciones" tone="blue">
                    {values.cliente_id ? (
                      <VehiculoSelector
                        clienteId={values.cliente_id}
                        value={values.cliente_vehiculo_id}
                        onChange={(id, data) => {
                          form.setValue("cliente_vehiculo_id", id);
                          form.setValue("vehicle_brand", data.vehiculos_catalogo?.marca ?? "");
                          form.setValue("vehicle_model", data.vehiculos_catalogo?.modelo ?? "");
                          form.setValue("license_plate", (data.patente ?? "").toUpperCase());
                        }}
                        allowAddNew
                      />
                    ) : null}
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <Label>Marca</Label>
                        <Input {...form.register("vehicle_brand")} />
                      </div>
                      <div>
                        <Label>Modelo</Label>
                        <Input {...form.register("vehicle_model")} />
                      </div>
                      <div>
                        <Label>Patente</Label>
                        <Input
                          {...form.register("license_plate")}
                          className="uppercase"
                          onChange={(event) =>
                            form.setValue("license_plate", event.target.value.toUpperCase(), {
                              shouldValidate: true,
                            })
                          }
                        />
                      </div>
                      <div>
                        <Label>VIN</Label>
                        <Input
                          {...form.register("vin")}
                          maxLength={17}
                          onChange={(event) =>
                            form.setValue("vin", event.target.value.toUpperCase(), { shouldValidate: true })
                          }
                        />
                      </div>
                      <div>
                        <Label>Origen *</Label>
                        <Input {...form.register("origen")} />
                        <FieldError message={form.formState.errors.origen?.message} />
                      </div>
                      <div>
                        <Label>Destino *</Label>
                        <Input {...form.register("destino")} />
                        <FieldError message={form.formState.errors.destino?.message} />
                      </div>
                    </div>
                  </SectionCard>
                </>
              ) : null}

              {step === 3 ? (
                <>
                  <SectionCard title="Recursos" tone="violet">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <Label>Grúa *</Label>
                        <Select
                          value={values.grua_id || "none"}
                          onValueChange={(value) =>
                            form.setValue("grua_id", value === "none" ? "" : value, { shouldValidate: true })
                          }
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona grúa" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Sin asignar</SelectItem>
                            {gruas.map((grua) => (
                              <SelectItem key={grua.id} value={grua.id}>
                                {grua.patente} · {grua.marca ?? ""} {grua.modelo ?? ""}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Forma de pago</Label>
                        <Select
                          value={values.forma_pago || "none"}
                          onValueChange={(value) => form.setValue("forma_pago", value === "none" ? "" : value)}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Selecciona" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Sin definir</SelectItem>
                            {FORMA_PAGO_OPTIONS.map((option) => (
                              <SelectItem key={option.value} value={option.value}>
                                {option.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <Separator />

                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="font-medium">Operadores múltiples</div>
                        <Button type="button" variant="outline" size="sm" onClick={addOperator}>
                          Agregar operador
                        </Button>
                      </div>
                      {operators.map((operator) => (
                        <div key={operator.id} className="grid gap-3 rounded-md border p-3 md:grid-cols-4">
                          <div>
                            <Label>Operador</Label>
                            <Select
                              value={operator.operatorId || "none"}
                              onValueChange={(value) =>
                                setOperators((prev) =>
                                  prev.map((row) =>
                                    row.id === operator.id
                                      ? { ...row, operatorId: value === "none" ? "" : value }
                                      : row,
                                  ),
                                )
                              }
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Selecciona" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">Sin asignar</SelectItem>
                                {operadores.map((item) => (
                                  <SelectItem key={item.id} value={item.id}>
                                    {item.nombre}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label>Rol</Label>
                            <Select
                              value={operator.role}
                              onValueChange={(value) =>
                                setOperators((prev) =>
                                  prev.map((row) =>
                                    row.id === operator.id
                                      ? { ...row, role: value as OperatorDraft["role"] }
                                      : row,
                                  ),
                                )
                              }
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="principal">Principal</SelectItem>
                                <SelectItem value="asistente">Asistente</SelectItem>
                              </SelectContent>
                            </Select>
                          </div>
                          <div>
                            <Label>Horas</Label>
                            <Input
                              type="number"
                              min={0}
                              value={operator.hours}
                              onChange={(event) =>
                                setOperators((prev) =>
                                  prev.map((row) =>
                                    row.id === operator.id ? { ...row, hours: event.target.value } : row,
                                  ),
                                )
                              }
                            />
                          </div>
                          <div>
                            <Label>Comisión (CLP)</Label>
                            <Input
                              type="number"
                              min={0}
                              value={operator.commission}
                              onChange={(event) =>
                                setOperators((prev) =>
                                  prev.map((row) =>
                                    row.id === operator.id
                                      ? { ...row, commission: event.target.value }
                                      : row,
                                  ),
                                )
                              }
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </SectionCard>

                  <SectionCard title="Subcontratación" tone="amber">
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={values.outsourced_enabled}
                        onCheckedChange={(checked) => form.setValue("outsourced_enabled", checked)}
                      />
                      <span className="text-sm">Servicio subcontratado a tercero</span>
                    </div>
                    {values.outsourced_enabled ? (
                      <div className="grid gap-4 md:grid-cols-3">
                        <div className="md:col-span-2">
                          <Label>Proveedor</Label>
                          <Select
                            value={values.outsourced_provider_id || "none"}
                            onValueChange={(value) =>
                              form.setValue("outsourced_provider_id", value === "none" ? "" : value)
                            }
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="Selecciona proveedor" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Selecciona...</SelectItem>
                              {proveedores.map((provider) => (
                                <SelectItem key={provider.id} value={provider.id}>
                                  {provider.nombre}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Costo tercero</Label>
                          <Input type="number" min={0} {...form.register("outsourced_cost")} />
                        </div>
                        <div className="md:col-span-3">
                          <Label>Notas</Label>
                          <Textarea rows={2} {...form.register("outsourced_notes")} />
                        </div>
                      </div>
                    ) : null}
                  </SectionCard>

                  <CostItemsSection
                    categorias={categorias}
                    subcategorias={subcategorias}
                    costs={costs}
                    onChange={setCosts}
                  />

                  <ProductItemsSection items={items} products={products} onChange={setProducts} />
                </>
              ) : null}

              {step === 4 ? (
                <>
                  <SectionCard title="Valores" tone="violet">
                    <div className="grid gap-4 md:grid-cols-2">
                      <div>
                        <Label>Valor del servicio (CLP)</Label>
                        <Input type="number" min={0} {...form.register("value")} />
                      </div>
                      <div>
                        <Label>Estado</Label>
                        <Select
                          value={values.estado}
                          onValueChange={(value) => form.setValue("estado", value as EnhancedServiceFormValues["estado"])}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ORDER_STATES.map((state) => (
                              <SelectItem key={state.value} value={state.value}>
                                {state.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <Switch
                        checked={values.has_excess}
                        onCheckedChange={(checked) => form.setValue("has_excess", checked)}
                      />
                      <span className="text-sm">Servicio con exceso</span>
                    </div>
                    {values.has_excess ? (
                      <div>
                        <Label>Monto cubierto por cliente</Label>
                        <Input type="number" min={0} {...form.register("client_covered_amount")} />
                        <FieldError message={form.formState.errors.client_covered_amount?.message} />
                        <div className="mt-2 text-sm text-muted-foreground">
                          Exceso calculado: {formatCLP(excessAmount)}
                        </div>
                      </div>
                    ) : null}
                  </SectionCard>

                  <SectionCard title="Custodia / arriendo" tone="amber">
                    <div className="flex items-center gap-3">
                      <Switch
                        checked={values.custody_enabled}
                        onCheckedChange={(checked) => form.setValue("custody_enabled", checked)}
                      />
                      <span className="text-sm">Habilitar custodia / arriendo</span>
                    </div>
                    {values.custody_enabled ? (
                      <div className="grid gap-4 md:grid-cols-3">
                        <div>
                          <Label>Tipo vehículo / equipo</Label>
                          <Input {...form.register("custody_vehicle_type")} />
                        </div>
                        <div>
                          <Label>Días</Label>
                          <Input type="number" min={0} {...form.register("custody_days")} />
                        </div>
                        <div>
                          <Label>Tarifa diaria</Label>
                          <Input type="number" min={0} {...form.register("custody_daily_rate")} />
                        </div>
                        <div className="md:col-span-3 text-sm text-muted-foreground">
                          Total custodia: {formatCLP(custodyTotal)}
                        </div>
                        <div className="md:col-span-3">
                          <Label>Notas</Label>
                          <Textarea rows={2} {...form.register("custody_notes")} />
                        </div>
                      </div>
                    ) : null}
                  </SectionCard>

                  <SectionCard title="Observaciones" tone="blue">
                    <Textarea rows={5} {...form.register("observations")} />
                  </SectionCard>
                </>
              ) : null}
            </div>

            <Card className="h-fit lg:sticky lg:top-4">
              <CardHeader>
                <CardTitle className="text-base">Resumen en vivo</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <SummaryRow label="Cliente" value={selectedClient?.nombre ?? "—"} />
                <SummaryRow
                  label="Tipo"
                  value={
                    TIPO_SERVICIO_OPTIONS.find((option) => option.value === values.tipo_servicio)?.label ?? "—"
                  }
                />
                <SummaryRow label="Folio" value={values.folio_interno || "—"} />
                <SummaryRow label="Valor base" value={formatCLP(Number(values.value || 0))} />
                <SummaryRow label="Comisiones" value={formatCLP(totalCommissions)} />
                <SummaryRow label="Costos" value={formatCLP(totalCosts)} />
                <SummaryRow label="Inventario" value={formatCLP(totalProducts)} />
                <SummaryRow label="Tercero" value={formatCLP(Number(values.outsourced_cost || 0))} />
                <SummaryRow label="Custodia" value={formatCLP(custodyTotal)} />
                <Separator />
                <SummaryRow label="Margen estimado" value={formatCLP(margin)} strong />
              </CardContent>
            </Card>
          </div>
        </div>

        <div className="sticky bottom-0 flex items-center justify-between gap-3 rounded-lg border bg-background/95 p-4 backdrop-blur">
          <div className="text-sm text-muted-foreground">
            El avance se valida por paso y no se guarda hasta confirmar el resumen.
          </div>
          <div className="flex gap-2">
            {step === 1 ? (
              <Button type="button" variant="ghost" onClick={onCancel}>
                Cancelar
              </Button>
            ) : (
              <Button type="button" variant="outline" onClick={previousStep}>
                <ArrowLeft className="mr-2 h-4 w-4" />
                Anterior
              </Button>
            )}
            {step < 4 ? (
              <Button type="button" onClick={nextStep} className="bg-violet-600 hover:bg-violet-700">
                Siguiente
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button type="submit" disabled={createMutation.isPending} className="bg-violet-600 hover:bg-violet-700">
                {createMutation.isPending ? "Guardando..." : "Guardar servicio"}
              </Button>
            )}
          </div>
        </div>
      </form>
    </Form>
  );
}

function CostItemsSection({
  categorias,
  subcategorias,
  costs,
  onChange,
}: {
  categorias: CategoriaCosto[];
  subcategorias: SubcategoriaCosto[];
  costs: CostDraft[];
  onChange: (value: CostDraft[]) => void;
}) {
  return (
    <SectionCard title="Costos del servicio" tone="blue" description="Se insertan vinculados al servicio al guardar.">
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            onChange([
              ...costs,
              {
                id: createDraftId(),
                categoria_id: "",
                subcategoria_id: "",
                descripcion: "",
                cantidad: "1",
                precio_unitario: "0",
                notas: "",
              },
            ])
          }
        >
          Agregar costo
        </Button>
      </div>
      <div className="space-y-3">
        {costs.length === 0 ? (
          <div className="text-sm text-muted-foreground">Sin costos cargados.</div>
        ) : (
          costs.map((cost) => {
            const filteredSubs = subcategorias.filter(
              (item) =>
                item.categoria_id === cost.categoria_id &&
                (!item.aplica_a || item.aplica_a === "ambos" || item.aplica_a === "servicio"),
            );
            return (
              <div key={cost.id} className="grid gap-3 rounded-md border p-3 md:grid-cols-6">
                <div className="md:col-span-2">
                  <Label>Categoría</Label>
                  <Select
                    value={cost.categoria_id || "none"}
                    onValueChange={(value) =>
                      onChange(
                        costs.map((row) =>
                          row.id === cost.id
                            ? { ...row, categoria_id: value === "none" ? "" : value, subcategoria_id: "" }
                            : row,
                        ),
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Selecciona…</SelectItem>
                      {categorias
                        .filter((item) => !item.tipo || item.tipo === "servicio" || item.tipo === "ambos")
                        .map((item) => (
                          <SelectItem key={item.id} value={item.id}>
                            {item.nombre}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="md:col-span-2">
                  <Label>Subcategoría</Label>
                  <Select
                    value={cost.subcategoria_id || "none"}
                    onValueChange={(value) =>
                      onChange(
                        costs.map((row) =>
                          row.id === cost.id ? { ...row, subcategoria_id: value === "none" ? "" : value } : row,
                        ),
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Selecciona…</SelectItem>
                      {filteredSubs.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.nombre}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Cantidad</Label>
                  <Input
                    type="number"
                    min={0}
                    value={cost.cantidad}
                    onChange={(event) =>
                      onChange(
                        costs.map((row) =>
                          row.id === cost.id ? { ...row, cantidad: event.target.value } : row,
                        ),
                      )
                    }
                  />
                </div>
                <div>
                  <Label>Precio unitario</Label>
                  <Input
                    type="number"
                    min={0}
                    value={cost.precio_unitario}
                    onChange={(event) =>
                      onChange(
                        costs.map((row) =>
                          row.id === cost.id ? { ...row, precio_unitario: event.target.value } : row,
                        ),
                      )
                    }
                  />
                </div>
                <div className="md:col-span-3">
                  <Label>Descripción</Label>
                  <Textarea
                    rows={2}
                    value={cost.descripcion}
                    onChange={(event) =>
                      onChange(
                        costs.map((row) =>
                          row.id === cost.id ? { ...row, descripcion: event.target.value } : row,
                        ),
                      )
                    }
                  />
                </div>
                <div className="md:col-span-2">
                  <Label>Notas</Label>
                  <Textarea
                    rows={2}
                    value={cost.notas}
                    onChange={(event) =>
                      onChange(
                        costs.map((row) =>
                          row.id === cost.id ? { ...row, notas: event.target.value } : row,
                        ),
                      )
                    }
                  />
                </div>
                <div className="flex flex-col justify-between">
                  <div className="text-sm text-muted-foreground">
                    Total: {formatCLP(amountFromParts(cost.cantidad, cost.precio_unitario))}
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => onChange(costs.filter((row) => row.id !== cost.id))}
                  >
                    Quitar
                  </Button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </SectionCard>
  );
}

function ProductItemsSection({
  items,
  products,
  onChange,
}: {
  items: BodegaItem[];
  products: ProductDraft[];
  onChange: (value: ProductDraft[]) => void;
}) {
  return (
    <SectionCard title="Venta de productos / inventario" tone="amber" description="Genera salidas de stock al crear el servicio.">
      <div className="flex justify-end">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            onChange([
              ...products,
              { id: createDraftId(), item_id: "", cantidad: "1", precio_unitario: "0", descuento: "0" },
            ])
          }
        >
          Agregar ítem
        </Button>
      </div>
      <div className="space-y-3">
        {products.length === 0 ? (
          <div className="text-sm text-muted-foreground">Sin productos cargados.</div>
        ) : (
          products.map((product) => {
            const selected = items.find((item) => item.id === product.item_id) ?? null;
            return (
              <div key={product.id} className="grid gap-3 rounded-md border p-3 md:grid-cols-5">
                <div className="md:col-span-2">
                  <Label>Ítem</Label>
                  <Select
                    value={product.item_id || "none"}
                    onValueChange={(value) =>
                      onChange(
                        products.map((row) =>
                          row.id === product.id
                            ? {
                                ...row,
                                item_id: value === "none" ? "" : value,
                                precio_unitario:
                                  value === "none"
                                    ? "0"
                                    : String(items.find((item) => item.id === value)?.precio_costo ?? 0),
                              }
                            : row,
                        ),
                      )
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Selecciona item" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Selecciona…</SelectItem>
                      {items.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.nombre} ({Number(item.stock_actual ?? 0)} {item.unidad ?? ""})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Cantidad</Label>
                  <Input
                    type="number"
                    min={0}
                    value={product.cantidad}
                    onChange={(event) =>
                      onChange(
                        products.map((row) =>
                          row.id === product.id ? { ...row, cantidad: event.target.value } : row,
                        ),
                      )
                    }
                  />
                </div>
                <div>
                  <Label>Precio unitario</Label>
                  <Input
                    type="number"
                    min={0}
                    value={product.precio_unitario}
                    onChange={(event) =>
                      onChange(
                        products.map((row) =>
                          row.id === product.id ? { ...row, precio_unitario: event.target.value } : row,
                        ),
                      )
                    }
                  />
                </div>
                <div>
                  <Label>Desc. %</Label>
                  <Input
                    type="number"
                    min={0}
                    value={product.descuento}
                    onChange={(event) =>
                      onChange(
                        products.map((row) =>
                          row.id === product.id ? { ...row, descuento: event.target.value } : row,
                        ),
                      )
                    }
                  />
                </div>
                <div className="md:col-span-5 flex items-center justify-between">
                  <div className="text-sm text-muted-foreground">
                    {selected?.nombre ?? "Sin ítem"} · Disponible {Number(selected?.stock_actual ?? 0)}{" "}
                    {selected?.unidad ?? ""}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-medium">
                      {formatCLP(amountFromParts(product.cantidad, product.precio_unitario, product.descuento))}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                    onClick={() => onChange(products.filter((row) => row.id !== product.id))}
                    >
                      Quitar
                    </Button>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </SectionCard>
  );
}

function FolioBadge({ status }: { status: "idle" | "checking" | "available" | "taken" }) {
  if (status === "available") {
    return <Badge className="bg-violet-600 text-white">Disponible</Badge>;
  }
  if (status === "taken") {
    return <Badge variant="destructive">Ocupado</Badge>;
  }
  if (status === "checking") {
    return <Badge variant="outline">Validando...</Badge>;
  }
  return null;
}

function SummaryRow({ label, value, strong = false }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground">{label}</span>
      <span className={strong ? "font-semibold" : "font-medium"}>{value}</span>
    </div>
  );
}

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return <div className="mt-1 text-xs text-destructive">{message}</div>;
}

function resetVehicleFields(
  form: ReturnType<typeof useForm<EnhancedServiceFormInput, unknown, EnhancedServiceFormValues>>,
) {
  form.setValue("cliente_vehiculo_id", "");
  form.setValue("vehicle_brand", "");
  form.setValue("vehicle_model", "");
  form.setValue("license_plate", "");
  form.setValue("vin", "");
}
