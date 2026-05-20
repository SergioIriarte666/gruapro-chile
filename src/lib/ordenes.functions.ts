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
  .handler(async ({ data, context }) => {
    const { data: orden, error: ordenErr } = await supabaseAdmin
      .from("ordenes_servicio")
      .select("id, estado, operador_id, grua_id, tipo_servicio")
      .eq("id", data.ordenId)
      .single();
    if (ordenErr) throw new Error(ordenErr.message);
    if (!orden) throw new Error("Orden no encontrada");

    if (!orden.operador_id || !orden.grua_id) {
      throw new Error("Para completar la orden debes asignar grúa y operador");
    }

    const { error: updErr } = await supabaseAdmin
      .from("ordenes_servicio")
      .update({ estado: "completado" })
      .eq("id", orden.id);
    if (updErr) throw new Error(updErr.message);

    await supabaseAdmin
      .from("service_change_history")
      .insert({
        entity_type: "orden",
        entity_id: orden.id,
        action: "estado_changed",
        old_value: orden,
        new_value: { estado: "completado" },
        created_by: context.userId as string,
      });

    const { data: comision } = await supabaseAdmin
      .from("comisiones")
      .select("monto_comision")
      .eq("orden_id", orden.id)
      .maybeSingle();

    return {
      ok: true,
      comisionCreada: !!comision,
      monto: comision ? Number(comision.monto_comision ?? 0) : 0,
    };
  });

// Anula la orden y elimina la comisión pendiente si existiera.
export const anularOrden = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z.object({ ordenId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: orden, error: ordenErr } = await supabaseAdmin
      .from("ordenes_servicio")
      .select("id, estado, operador_id, grua_id, tipo_servicio")
      .eq("id", data.ordenId)
      .single();
    if (ordenErr) throw new Error(ordenErr.message);

    const { data: cierreActivo, error: cierreErr } = await supabaseAdmin
      .from("cierre_servicios")
      .select("id, cierres(estado)")
      .eq("orden_id", data.ordenId)
      .maybeSingle();
    if (cierreErr) throw new Error(cierreErr.message);

    const estadoCierre = (cierreActivo as any)?.cierres?.estado as string | undefined;
    if (estadoCierre && estadoCierre !== "anulado") {
      throw new Error("No se puede anular una orden incluida en un cierre activo");
    }

    const { error: updErr } = await supabaseAdmin
      .from("ordenes_servicio")
      .update({ estado: "anulado" })
      .eq("id", data.ordenId);
    if (updErr) throw new Error(updErr.message);

    await supabaseAdmin
      .from("service_change_history")
      .insert({
        entity_type: "orden",
        entity_id: data.ordenId,
        action: "estado_changed",
        old_value: orden,
        new_value: { estado: "anulado" },
        created_by: context.userId as string,
      });

    return { ok: true };
  });

// Cambia el estado a cualquier valor "simple" (sin side-effects).
export const cambiarEstadoOrden = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) =>
    z
      .object({
        ordenId: z.string().uuid(),
        estado: z.enum(["pendiente", "en_curso"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { data: before, error: beforeErr } = await supabaseAdmin
      .from("ordenes_servicio")
      .select("id, estado, operador_id, grua_id, tipo_servicio")
      .eq("id", data.ordenId)
      .single();
    if (beforeErr) throw new Error(beforeErr.message);

    if (data.estado === "en_curso") {
      if (!before.grua_id || !before.operador_id) {
        throw new Error("Para iniciar la orden debes asignar grúa y operador");
      }
    }

    const { error } = await supabaseAdmin
      .from("ordenes_servicio")
      .update({ estado: data.estado })
      .eq("id", data.ordenId);
    if (error) throw new Error(error.message);

    await supabaseAdmin
      .from("service_change_history")
      .insert({
        entity_type: "orden",
        entity_id: data.ordenId,
        action: "estado_changed",
        old_value: before,
        new_value: { estado: data.estado },
        created_by: context.userId as string,
      });

    return { ok: true };
  });
