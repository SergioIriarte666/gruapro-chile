-- =========================================================
-- BODEGA: Trigger para mantener stock_actual via movimientos
-- =========================================================

CREATE OR REPLACE FUNCTION public.apply_bodega_movement()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  current_stock NUMERIC;
  new_stock NUMERIC;
BEGIN
  SELECT stock_actual
    INTO current_stock
  FROM public.bodega_items
  WHERE id = NEW.item_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ítem de bodega no encontrado';
  END IF;

  IF NEW.tipo = 'entrada' THEN
    new_stock := current_stock + NEW.cantidad;
  ELSIF NEW.tipo = 'salida' THEN
    IF current_stock - NEW.cantidad < 0 THEN
      RAISE EXCEPTION 'Stock insuficiente. Disponible: %', current_stock;
    END IF;
    new_stock := current_stock - NEW.cantidad;
  ELSIF NEW.tipo = 'ajuste' THEN
    IF NEW.cantidad < 0 THEN
      RAISE EXCEPTION 'Stock no puede ser negativo';
    END IF;
    new_stock := NEW.cantidad;
  ELSE
    RAISE EXCEPTION 'Tipo de movimiento inválido: %', NEW.tipo;
  END IF;

  UPDATE public.bodega_items
  SET stock_actual = new_stock
  WHERE id = NEW.item_id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_apply_bodega_movement ON public.bodega_movimientos;
CREATE TRIGGER trg_apply_bodega_movement
AFTER INSERT ON public.bodega_movimientos
FOR EACH ROW
EXECUTE FUNCTION public.apply_bodega_movement();
