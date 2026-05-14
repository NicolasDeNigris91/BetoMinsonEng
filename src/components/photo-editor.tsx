"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  Circle as CircleIcon,
  Pen,
  RotateCcw,
  Square,
  Trash2,
  Type,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Tool = "pen" | "circle" | "rect" | "arrow" | "text";
type ColorKey = "red" | "yellow" | "green" | "black";
type StrokeKey = "thin" | "medium" | "thick";

const COLORS: Record<ColorKey, string> = {
  red: "#dc2626",
  yellow: "#eab308",
  green: "#16a34a",
  black: "#111827",
};

const STROKE_WIDTHS: Record<StrokeKey, number> = {
  thin: 3,
  medium: 6,
  thick: 12,
};

const TEXT_SIZES: Record<StrokeKey, number> = {
  thin: 24,
  medium: 36,
  thick: 56,
};

const MAX_EDIT_DIM = 2000;

type Point = { x: number; y: number };
type ShapeBase = { color: ColorKey; width: StrokeKey };
type ShapePen = ShapeBase & { type: "pen"; points: Point[] };
type ShapeBox = ShapeBase & {
  type: "circle" | "rect" | "arrow";
  start: Point;
  end: Point;
};
type ShapeText = ShapeBase & { type: "text"; pos: Point; content: string };
type Shape = ShapePen | ShapeBox | ShapeText;

type Props = {
  file: File;
  queueLabel?: string;
  onConfirm: (edited: File) => void;
  onSkip: () => void;
  onCancel: () => void;
};

export function PhotoEditor({
  file,
  queueLabel,
  onConfirm,
  onSkip,
  onCancel,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState<ColorKey>("red");
  const [width, setWidth] = useState<StrokeKey>("medium");
  const [shapes, setShapes] = useState<Shape[]>([]);
  const draftRef = useRef<Shape | null>(null);
  const drawingRef = useRef(false);

  const [textInput, setTextInput] = useState<{
    imageX: number;
    imageY: number;
    cssLeft: number;
    cssTop: number;
  } | null>(null);
  const [textValue, setTextValue] = useState("");

  const [imageReady, setImageReady] = useState(false);
  const [imgError, setImgError] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;
      const ratio = Math.min(
        1,
        MAX_EDIT_DIM / Math.max(img.naturalWidth, img.naturalHeight),
      );
      canvas.width = Math.round(img.naturalWidth * ratio);
      canvas.height = Math.round(img.naturalHeight * ratio);
      imageRef.current = img;
      setImageReady(true);
    };
    img.onerror = () => setImgError(true);
    img.src = url;
    return () => {
      URL.revokeObjectURL(url);
    };
  }, [file]);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    const img = imageRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const s of shapes) drawShape(ctx, s);
    if (draftRef.current) drawShape(ctx, draftRef.current);
  }, [shapes]);

  useEffect(() => {
    if (imageReady) redraw();
  }, [imageReady, redraw]);

  const screenToImage = (clientX: number, clientY: number): Point => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (tool === "text") return;
    if (textInput) return;
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    const pt = screenToImage(e.clientX, e.clientY);
    drawingRef.current = true;
    if (tool === "pen") {
      draftRef.current = { type: "pen", points: [pt], color, width };
    } else {
      draftRef.current = { type: tool, start: pt, end: pt, color, width };
    }
    redraw();
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current || !draftRef.current) return;
    e.preventDefault();
    const pt = screenToImage(e.clientX, e.clientY);
    const draft = draftRef.current;
    if (draft.type === "pen") {
      draft.points.push(pt);
    } else if (
      draft.type === "circle" ||
      draft.type === "rect" ||
      draft.type === "arrow"
    ) {
      draft.end = pt;
    }
    redraw();
  };

  const onPointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    drawingRef.current = false;
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {
      /* ignore */
    }
    const draft = draftRef.current;
    draftRef.current = null;
    if (!draft) return;
    if (draft.type === "pen" && draft.points.length < 2) {
      redraw();
      return;
    }
    if (
      (draft.type === "circle" ||
        draft.type === "rect" ||
        draft.type === "arrow") &&
      Math.abs(draft.end.x - draft.start.x) < 3 &&
      Math.abs(draft.end.y - draft.start.y) < 3
    ) {
      redraw();
      return;
    }
    setShapes((prev) => [...prev, draft]);
  };

  const onCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (tool !== "text") return;
    if (textInput) return;
    const container = containerRef.current;
    if (!container) return;
    const containerRect = container.getBoundingClientRect();
    const pt = screenToImage(e.clientX, e.clientY);
    setTextInput({
      imageX: pt.x,
      imageY: pt.y,
      cssLeft: e.clientX - containerRect.left,
      cssTop: e.clientY - containerRect.top,
    });
    setTextValue("");
  };

  const commitText = () => {
    if (!textInput) return;
    const trimmed = textValue.trim();
    if (trimmed.length > 0) {
      setShapes((prev) => [
        ...prev,
        {
          type: "text",
          pos: { x: textInput.imageX, y: textInput.imageY },
          content: trimmed,
          color,
          width,
        },
      ]);
    }
    setTextInput(null);
    setTextValue("");
  };

  const cancelText = () => {
    setTextInput(null);
    setTextValue("");
  };

  const undo = () => setShapes((prev) => prev.slice(0, -1));
  const clearAll = () => setShapes([]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "z") {
        e.preventDefault();
        if (textInput) return;
        setShapes((prev) => prev.slice(0, -1));
      }
      if (e.key === "Escape") {
        if (textInput) cancelText();
        else onCancel();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [textInput, onCancel]);

  const handleSave = async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSaving(true);
    try {
      const blob: Blob | null = await new Promise((resolve) =>
        canvas.toBlob((b) => resolve(b), "image/jpeg", 0.92),
      );
      if (!blob) {
        setSaving(false);
        return;
      }
      const baseName = file.name.replace(/\.[^.]+$/, "") || "foto";
      const edited = new File([blob], `${baseName}-marcado.jpg`, {
        type: "image/jpeg",
      });
      onConfirm(edited);
    } catch (err) {
      console.error("[photo-editor] toBlob failed", err);
      setSaving(false);
    }
  };

  if (imgError) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
        <div className="max-w-sm rounded-lg bg-background p-6 text-center text-foreground">
          <p className="text-sm">
            Não foi possível carregar a imagem no editor. Vamos enviar como
            está.
          </p>
          <div className="mt-4 flex justify-center gap-2">
            <Button type="button" variant="outline" onClick={onCancel}>
              Cancelar tudo
            </Button>
            <Button type="button" onClick={onSkip}>
              Enviar sem editar
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      role="dialog"
      aria-label="Editor de foto"
      aria-modal="true"
      className="fixed inset-0 z-50 flex flex-col bg-black/95 text-white"
    >
      <header className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <div className="text-sm font-medium">
          Marcar foto
          {queueLabel ? (
            <span className="ml-2 text-white/60">{queueLabel}</span>
          ) : null}
        </div>
        <button
          type="button"
          onClick={onCancel}
          className="rounded p-1 hover:bg-white/10"
          aria-label="Fechar editor"
        >
          <X className="size-5" />
        </button>
      </header>

      <div className="flex flex-wrap items-center gap-1.5 border-b border-white/10 px-3 py-2 text-sm">
        <ToolButton
          active={tool === "pen"}
          onClick={() => setTool("pen")}
          icon={<Pen className="size-4" />}
          label="Caneta"
        />
        <ToolButton
          active={tool === "circle"}
          onClick={() => setTool("circle")}
          icon={<CircleIcon className="size-4" />}
          label="Círculo"
        />
        <ToolButton
          active={tool === "rect"}
          onClick={() => setTool("rect")}
          icon={<Square className="size-4" />}
          label="Retângulo"
        />
        <ToolButton
          active={tool === "arrow"}
          onClick={() => setTool("arrow")}
          icon={<ArrowRight className="size-4" />}
          label="Seta"
        />
        <ToolButton
          active={tool === "text"}
          onClick={() => setTool("text")}
          icon={<Type className="size-4" />}
          label="Texto"
        />

        <span className="mx-1 hidden h-5 w-px bg-white/15 sm:inline-block" aria-hidden />

        {(Object.keys(COLORS) as ColorKey[]).map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setColor(c)}
            aria-label={`Cor ${c}`}
            aria-pressed={color === c}
            className={cn(
              "size-7 rounded-full border-2 transition-transform",
              color === c
                ? "border-white scale-110 ring-2 ring-white/40"
                : "border-white/30",
            )}
            style={{ backgroundColor: COLORS[c] }}
          />
        ))}

        <span className="mx-1 hidden h-5 w-px bg-white/15 sm:inline-block" aria-hidden />

        {(["thin", "medium", "thick"] as StrokeKey[]).map((w) => (
          <button
            key={w}
            type="button"
            onClick={() => setWidth(w)}
            aria-label={`Espessura ${w}`}
            aria-pressed={width === w}
            className={cn(
              "rounded px-2 py-1 text-xs transition-colors",
              width === w
                ? "bg-white text-black"
                : "bg-white/10 text-white hover:bg-white/20",
            )}
          >
            {w === "thin" ? "Fino" : w === "medium" ? "Médio" : "Grosso"}
          </button>
        ))}

        <span className="ml-auto" />

        <button
          type="button"
          onClick={undo}
          disabled={shapes.length === 0}
          className="inline-flex items-center gap-1 rounded bg-white/10 px-2 py-1 text-xs hover:bg-white/20 disabled:opacity-30"
          aria-label="Desfazer última marcação"
        >
          <RotateCcw className="size-3.5" />
          Desfazer
        </button>
        <button
          type="button"
          onClick={clearAll}
          disabled={shapes.length === 0}
          className="inline-flex items-center gap-1 rounded bg-white/10 px-2 py-1 text-xs hover:bg-white/20 disabled:opacity-30"
          aria-label="Limpar todas as marcações"
        >
          <Trash2 className="size-3.5" />
          Limpar
        </button>
      </div>

      <div className="relative flex flex-1 items-center justify-center overflow-auto p-2">
        <div className="relative">
          <canvas
            ref={canvasRef}
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            onClick={onCanvasClick}
            style={{
              touchAction: "none",
              maxWidth: "100%",
              maxHeight: "calc(100vh - 220px)",
              cursor: tool === "text" ? "text" : "crosshair",
              backgroundColor: "white",
              opacity: imageReady ? 1 : 0.3,
            }}
            className="rounded shadow-lg"
          />
          {textInput ? (
            <input
              autoFocus
              value={textValue}
              onChange={(e) => setTextValue(e.target.value)}
              onBlur={commitText}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  commitText();
                } else if (e.key === "Escape") {
                  e.preventDefault();
                  cancelText();
                }
              }}
              placeholder="Digite e Enter..."
              maxLength={120}
              className="absolute z-10 rounded bg-white/95 px-2 py-1 text-black outline-none ring-2 ring-blue-500"
              style={{
                left: `${textInput.cssLeft}px`,
                top: `${textInput.cssTop}px`,
                fontSize: `${Math.max(14, TEXT_SIZES[width] / 2)}px`,
                color: COLORS[color],
                fontWeight: 700,
              }}
            />
          ) : null}
        </div>
      </div>

      <footer className="flex items-center justify-between gap-2 border-t border-white/10 px-3 py-3">
        <Button
          type="button"
          variant="ghost"
          onClick={onSkip}
          disabled={saving}
          className="text-white hover:bg-white/10"
        >
          Pular edição
        </Button>
        <Button
          type="button"
          onClick={handleSave}
          disabled={saving || !imageReady}
        >
          <Check className="mr-1.5 size-4" />
          {saving ? "Salvando..." : "Salvar e enviar"}
        </Button>
      </footer>
    </div>
  );
}

function ToolButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      title={label}
      className={cn(
        "inline-flex items-center gap-1 rounded px-2 py-1 text-xs transition-colors",
        active
          ? "bg-white text-black"
          : "bg-white/10 text-white hover:bg-white/20",
      )}
    >
      {icon}
      <span className="hidden sm:inline">{label}</span>
    </button>
  );
}

function drawShape(ctx: CanvasRenderingContext2D, shape: Shape): void {
  const color = COLORS[shape.color];
  const stroke = STROKE_WIDTHS[shape.width];
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = stroke;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  switch (shape.type) {
    case "pen": {
      if (shape.points.length === 0) return;
      ctx.beginPath();
      ctx.moveTo(shape.points[0].x, shape.points[0].y);
      for (let i = 1; i < shape.points.length; i++) {
        ctx.lineTo(shape.points[i].x, shape.points[i].y);
      }
      ctx.stroke();
      return;
    }
    case "rect": {
      ctx.strokeRect(
        shape.start.x,
        shape.start.y,
        shape.end.x - shape.start.x,
        shape.end.y - shape.start.y,
      );
      return;
    }
    case "circle": {
      const cx = (shape.start.x + shape.end.x) / 2;
      const cy = (shape.start.y + shape.end.y) / 2;
      const rx = Math.abs(shape.end.x - shape.start.x) / 2;
      const ry = Math.abs(shape.end.y - shape.start.y) / 2;
      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.stroke();
      return;
    }
    case "arrow": {
      ctx.beginPath();
      ctx.moveTo(shape.start.x, shape.start.y);
      ctx.lineTo(shape.end.x, shape.end.y);
      ctx.stroke();
      const angle = Math.atan2(
        shape.end.y - shape.start.y,
        shape.end.x - shape.start.x,
      );
      const headLen = stroke * 4;
      ctx.beginPath();
      ctx.moveTo(shape.end.x, shape.end.y);
      ctx.lineTo(
        shape.end.x - headLen * Math.cos(angle - Math.PI / 6),
        shape.end.y - headLen * Math.sin(angle - Math.PI / 6),
      );
      ctx.moveTo(shape.end.x, shape.end.y);
      ctx.lineTo(
        shape.end.x - headLen * Math.cos(angle + Math.PI / 6),
        shape.end.y - headLen * Math.sin(angle + Math.PI / 6),
      );
      ctx.stroke();
      return;
    }
    case "text": {
      const fontSize = TEXT_SIZES[shape.width];
      ctx.font = `700 ${fontSize}px sans-serif`;
      ctx.textBaseline = "top";
      const metrics = ctx.measureText(shape.content);
      const padding = fontSize * 0.18;
      const bgX = shape.pos.x - padding;
      const bgY = shape.pos.y - padding;
      const bgW = metrics.width + padding * 2;
      const bgH = fontSize + padding * 2;
      ctx.fillStyle = "rgba(255, 255, 255, 0.88)";
      ctx.fillRect(bgX, bgY, bgW, bgH);
      ctx.fillStyle = color;
      ctx.fillText(shape.content, shape.pos.x, shape.pos.y);
      return;
    }
  }
}
