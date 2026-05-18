import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const ensureUserRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({}).parse(input))
  .handler(async ({ context }) => {
    try {
      const userId = context.userId as string;

      const { data: existentes, error: existentesErr } = await supabaseAdmin
        .from("user_roles")
        .select("role")
        .eq("user_id", userId);
      if (existentesErr) throw new Error(existentesErr.message);

      if ((existentes?.length ?? 0) > 0) {
        return { ok: true, roles: existentes!.map((r) => r.role) };
      }

      const { count, error: countErr } = await supabaseAdmin
        .from("user_roles")
        .select("id", { count: "exact", head: true });
      if (countErr) throw new Error(countErr.message);

      const role = (count ?? 0) === 0 ? "admin" : "operador";
      const { error: insErr } = await supabaseAdmin
        .from("user_roles")
        .insert({ user_id: userId, role });
      if (insErr) throw new Error(insErr.message);

      return { ok: true, assigned: role };
    } catch (e) {
      const message = e instanceof Error ? e.message : "Error desconocido";
      const isMissingAdminKey = message.includes("SUPABASE_SERVICE_ROLE_KEY");
      return { ok: false, error: isMissingAdminKey ? "ADMIN_KEY_MISSING" : message };
    }
  });

// Marca una orden como completada y genera la comisión del operador
// según config_comisiones.tipo_servicio. Idempotente: no duplica comisión.
export const completarOrden = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ ordenId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { data: orden, error: ordenErr } = await supabaseAdmin
      .from("ordenes_servicio")
      .select("id, estado, operador_id, tipo_servicio")
      .eq("id", data.ordenId)
      .single();
    if (ordenErr) throw new Error(ordenErr.message);
    if (!orden) throw new Error("Orden no encontrada");

    const { error: updErr } = await supabaseAdmin
      .from("ordenes_servicio")
      .update({ estado: "completado" })
      .eq("id", orden.id);
    if (updErr) throw new Error(updErr.message);

    if (!orden.operador_id || !orden.tipo_servicio) {
      return { ok: true, comisionCreada: false };
    }

    // ¿ya hay comisión?
    const { data: existente } = await supabaseAdmin
      .from("comisiones")
      .select("id")
      .eq("orden_id", orden.id)
      .maybeSingle();
    if (existente) return { ok: true, comisionCreada: false };

    // Buscar monto de comisión configurado
    const { data: cfg } = await supabaseAdmin
      .from("config_comisiones")
      .select("monto_comision")
      .eq("tipo_servicio", orden.tipo_servicio)
      .maybeSingle();
    const monto = Number(cfg?.monto_comision ?? 0);

    const { error: comErr } = await supabaseAdmin.from("comisiones").insert({
      orden_id: orden.id,
      operador_id: orden.operador_id,
      monto_comision: monto,
      estado: "pendiente",
    });
    if (comErr) throw new Error(comErr.message);

    return { ok: true, comisionCreada: true, monto };
  });

// Anula la orden y elimina la comisión pendiente si existiera.
export const anularOrden = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ ordenId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data }) => {
    const { error: updErr } = await supabaseAdmin
      .from("ordenes_servicio")
      .update({ estado: "anulado" })
      .eq("id", data.ordenId);
    if (updErr) throw new Error(updErr.message);

    const { error: delErr } = await supabaseAdmin
      .from("comisiones")
      .delete()
      .eq("orden_id", data.ordenId)
      .eq("estado", "pendiente");
    if (delErr) throw new Error(delErr.message);

    return { ok: true };
  });

// Cambia el estado a cualquier valor "simple" (sin side-effects).
export const cambiarEstadoOrden = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        ordenId: z.string().uuid(),
        estado: z.enum(["pendiente", "asignado", "en_curso"]),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { error } = await supabaseAdmin
      .from("ordenes_servicio")
      .update({ estado: data.estado })
      .eq("id", data.ordenId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
