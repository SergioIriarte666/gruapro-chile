import { useQuery } from "@tanstack/react-query";

import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { formatDateTime } from "@/lib/format";

type Row = {
  id: string;
  action: string | null;
  created_at: string | null;
  old_value: any;
  new_value: any;
};

export function ChangeHistoryPanel({
  entityType,
  entityId,
}: {
  entityType: string;
  entityId: string;
}) {
  const { data = [], isLoading, error } = useQuery({
    queryKey: ["change-history", entityType, entityId],
    queryFn: async (): Promise<Row[]> => {
      const { data, error } = await (supabase as any)
        .from("service_change_history")
        .select("id,action,created_at,old_value,new_value")
        .eq("entity_type", entityType)
        .eq("entity_id", entityId)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as unknown as Row[];
    },
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Historial</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="text-sm text-muted-foreground">Cargando...</div>
        ) : error ? (
          <div className="text-sm text-destructive">{(error as Error).message}</div>
        ) : data.length === 0 ? (
          <div className="text-sm text-muted-foreground">Sin cambios registrados.</div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Acción</TableHead>
                <TableHead>Fecha</TableHead>
                <TableHead>Cambios</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <Badge variant="outline" className="capitalize">
                      {r.action ?? "—"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {formatDateTime(r.created_at)}
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {JSON.stringify({ old: r.old_value, new: r.new_value })}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
