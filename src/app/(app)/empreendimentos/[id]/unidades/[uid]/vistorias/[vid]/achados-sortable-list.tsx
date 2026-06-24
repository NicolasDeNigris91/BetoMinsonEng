"use client";

import { useState, useTransition } from "react";
import {
  DndContext,
  PointerSensor,
  KeyboardSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { isNextRedirectError } from "@/lib/next-errors";
import { reorderAchadosAction } from "./actions";

type Props = {
  vistoriaId: string;
  achadoIds: string[];
  reorderable: boolean;
  children: React.ReactNode[];
};

export function AchadosSortableList({
  vistoriaId,
  achadoIds,
  reorderable,
  children,
}: Props) {
  // Re-sync via "previous renders" pattern (sem useEffect): se achadoIds
  // muda do server, novos achados ficariam invisiveis no estado local.
  const idsKey = achadoIds.join("|");
  const [order, setOrder] = useState<string[]>(achadoIds);
  const [syncedKey, setSyncedKey] = useState<string>(idsKey);
  if (syncedKey !== idsKey) {
    setSyncedKey(idsKey);
    setOrder(achadoIds);
  }
  const [pending, start] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  if (!reorderable) {
    return <div className="space-y-2">{children}</div>;
  }

  const childById = new Map<string, React.ReactNode>();
  for (let i = 0; i < achadoIds.length; i++) {
    childById.set(achadoIds[i], children[i]);
  }

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = order.indexOf(String(active.id));
    const newIndex = order.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;

    const next = arrayMove(order, oldIndex, newIndex);
    const previous = order;
    setOrder(next);

    start(async () => {
      try {
        const result = await reorderAchadosAction(vistoriaId, next);
        if (result?.error) {
          setOrder(previous);
          toast.error(result.error);
        }
      } catch (err) {
        if (isNextRedirectError(err)) throw err;
        setOrder(previous);
        toast.error("Falha ao reordenar. Tente novamente.");
      }
    });
  };

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
    >
      <SortableContext items={order} strategy={verticalListSortingStrategy}>
        <div className={cn("space-y-2", pending && "opacity-90")}>
          {order.map((id) => (
            <SortableItem key={id} id={id}>
              {childById.get(id)}
            </SortableItem>
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}

function SortableItem({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "relative",
        isDragging && "z-10 opacity-70",
      )}
    >
      <button
        type="button"
        {...attributes}
        {...listeners}
        aria-label="Reordenar achado"
        className="absolute top-3 left-[-30px] hidden size-7 cursor-grab items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground active:cursor-grabbing md:flex"
      >
        <GripVertical className="size-4" />
      </button>
      {children}
    </div>
  );
}
