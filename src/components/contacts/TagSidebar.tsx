import { useState } from "react";
import { Tag, Plus, Pencil, Trash2, Check, X, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  useContactTagDefinitions,
  useCreateTagDefinition,
  useUpdateTagDefinition,
  useDeleteTagDefinition,
  pickTagColor,
  type ContactTagDefinition,
} from "@/hooks/useContactTags";
import type { ImportedContact } from "@/hooks/useContacts";

const COLOR_SWATCHES = [
  "#ef4444", "#f97316", "#f59e0b", "#22c55e",
  "#14b8a6", "#3b82f6", "#6366f1", "#a855f7",
  "#ec4899", "#64748b",
];

interface Props {
  contacts: ImportedContact[];
  selectedTag: string | null;
  onSelectTag: (tag: string | null) => void;
}

interface EditState {
  id: string;
  name: string;
  color: string;
}

export default function TagSidebar({ contacts, selectedTag, onSelectTag }: Props) {
  const { data: tagDefs = [] } = useContactTagDefinitions();
  const createTag  = useCreateTagDefinition();
  const updateTag  = useUpdateTagDefinition();
  const deleteTag  = useDeleteTagDefinition();

  const [newName,     setNewName]     = useState("");
  const [showNew,     setShowNew]     = useState(false);
  const [newColor,    setNewColor]    = useState(COLOR_SWATCHES[0]);
  const [editState,   setEditState]   = useState<EditState | null>(null);
  const [confirmDel,  setConfirmDel]  = useState<string | null>(null);

  // Count contacts per tag
  const tagCounts = new Map<string, number>();
  contacts.forEach((c) => {
    (c.tags ?? []).forEach((t) => tagCounts.set(t, (tagCounts.get(t) ?? 0) + 1));
  });

  // Tags that exist in contacts but have no definition (legacy / imported)
  const definedNames = new Set(tagDefs.map((d) => d.name));
  const orphanTags = Array.from(tagCounts.keys()).filter((t) => !definedNames.has(t)).sort();

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    await createTag.mutateAsync({ name, color: newColor });
    setNewName("");
    setShowNew(false);
    setNewColor(pickTagColor(tagDefs.map((d) => d.color)));
  };

  const handleSaveEdit = async () => {
    if (!editState) return;
    await updateTag.mutateAsync({ id: editState.id, name: editState.name, color: editState.color });
    setEditState(null);
  };

  const handleDelete = async (def: ContactTagDefinition) => {
    if (confirmDel === def.id) {
      await deleteTag.mutateAsync(def.id);
      if (selectedTag === def.name) onSelectTag(null);
      setConfirmDel(null);
    } else {
      setConfirmDel(def.id);
    }
  };

  const totalWithEmail = contacts.filter((c) => c.email).length;

  return (
    <div className="flex flex-col gap-1 h-full">
      {/* All Contacts */}
      <button
        onClick={() => onSelectTag(null)}
        className={cn(
          "flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm font-medium w-full text-left transition-colors",
          selectedTag === null
            ? "bg-primary/10 text-primary"
            : "text-muted-foreground hover:bg-muted hover:text-foreground"
        )}
      >
        <Users size={14} className="shrink-0" />
        <span className="flex-1 truncate">All Contacts</span>
        <span className="text-[10px] font-normal tabular-nums">{totalWithEmail}</span>
      </button>

      <div className="mt-2 mb-1 flex items-center justify-between px-1">
        <p className="text-[10px] uppercase tracking-widest font-semibold text-muted-foreground">Tags</p>
        <button
          onClick={() => { setShowNew(true); setNewColor(pickTagColor(tagDefs.map((d) => d.color))); }}
          className="text-muted-foreground hover:text-primary transition-colors"
          title="Create tag"
        >
          <Plus size={13} />
        </button>
      </div>

      {/* Defined tags */}
      {tagDefs.map((def) => {
        const isEditing  = editState?.id === def.id;
        const isDeleting = confirmDel === def.id;
        const count      = tagCounts.get(def.name) ?? 0;
        const isActive   = selectedTag === def.name;

        if (isEditing) {
          return (
            <div key={def.id} className="px-2 py-1.5 rounded-lg border border-border bg-muted/30 space-y-2">
              <input
                autoFocus
                value={editState.name}
                onChange={(e) => setEditState({ ...editState, name: e.target.value })}
                onKeyDown={(e) => e.key === "Enter" && handleSaveEdit()}
                className="w-full h-7 text-xs bg-background border border-border rounded-md px-2 focus:outline-none focus:ring-1 focus:ring-ring"
              />
              <div className="flex flex-wrap gap-1">
                {COLOR_SWATCHES.map((c) => (
                  <button
                    key={c}
                    onClick={() => setEditState({ ...editState, color: c })}
                    style={{ background: c }}
                    className={cn(
                      "w-4 h-4 rounded-full border-2 transition-transform",
                      editState.color === c ? "border-foreground scale-110" : "border-transparent"
                    )}
                  />
                ))}
              </div>
              <div className="flex gap-1">
                <button onClick={handleSaveEdit} className="flex-1 h-6 text-[10px] bg-primary text-primary-foreground rounded-md font-medium flex items-center justify-center gap-1">
                  <Check size={10} /> Save
                </button>
                <button onClick={() => setEditState(null)} className="flex-1 h-6 text-[10px] border border-border rounded-md text-muted-foreground flex items-center justify-center gap-1">
                  <X size={10} /> Cancel
                </button>
              </div>
            </div>
          );
        }

        return (
          <div
            key={def.id}
            className={cn(
              "group flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors",
              isActive
                ? "bg-primary/10"
                : "hover:bg-muted"
            )}
            onClick={() => onSelectTag(isActive ? null : def.name)}
          >
            <span
              className="w-2.5 h-2.5 rounded-full shrink-0"
              style={{ background: def.color }}
            />
            <span className={cn("flex-1 text-sm truncate", isActive ? "text-primary font-medium" : "text-foreground")}>
              {def.name}
            </span>
            <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">{count}</span>
            <div className="hidden group-hover:flex items-center gap-0.5 shrink-0">
              {isDeleting ? (
                <>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(def); }}
                    className="text-[9px] px-1 py-0.5 bg-destructive text-destructive-foreground rounded font-medium"
                    title="Confirm delete"
                  >Delete?</button>
                  <button
                    onClick={(e) => { e.stopPropagation(); setConfirmDel(null); }}
                    className="p-0.5 text-muted-foreground hover:text-foreground"
                  ><X size={10} /></button>
                </>
              ) : (
                <>
                  <button
                    onClick={(e) => { e.stopPropagation(); setEditState({ id: def.id, name: def.name, color: def.color }); }}
                    className="p-0.5 text-muted-foreground hover:text-foreground"
                    title="Edit tag"
                  ><Pencil size={10} /></button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(def); }}
                    className="p-0.5 text-muted-foreground hover:text-destructive"
                    title="Delete tag"
                  ><Trash2 size={10} /></button>
                </>
              )}
            </div>
          </div>
        );
      })}

      {/* Orphan tags (exist on contacts but no definition) */}
      {orphanTags.map((name) => (
        <button
          key={name}
          onClick={() => onSelectTag(selectedTag === name ? null : name)}
          className={cn(
            "flex items-center gap-2 px-3 py-2 rounded-lg text-sm w-full text-left transition-colors",
            selectedTag === name
              ? "bg-primary/10 text-primary font-medium"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          <span className="w-2.5 h-2.5 rounded-full shrink-0 bg-slate-400" />
          <span className="flex-1 truncate">{name}</span>
          <span className="text-[10px] tabular-nums">{tagCounts.get(name) ?? 0}</span>
        </button>
      ))}

      {/* Empty state */}
      {tagDefs.length === 0 && orphanTags.length === 0 && (
        <div className="px-2 py-4 text-center space-y-2">
          <Tag size={20} className="mx-auto text-muted-foreground opacity-40" />
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            No tags yet. Click <strong>+</strong> to create one, then assign it to contacts using the <strong>🏷</strong> button on any contact row.
          </p>
        </div>
      )}

      {/* How-to hint when tags exist but a tag has 0 contacts */}
      {tagDefs.length > 0 && (
        <p className="text-[10px] text-muted-foreground/60 px-1 pt-2 leading-relaxed">
          Use the <strong>🏷</strong> button on a contact row, or open a contact to assign tags.
        </p>
      )}

      {/* New tag form */}
      {showNew && (
        <div className="mt-1 px-2 py-2 rounded-lg border border-border bg-muted/30 space-y-2">
          <input
            autoFocus
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleCreate()}
            placeholder="Tag name…"
            className="w-full h-7 text-xs bg-background border border-border rounded-md px-2 focus:outline-none focus:ring-1 focus:ring-ring"
          />
          <div className="flex flex-wrap gap-1">
            {COLOR_SWATCHES.map((c) => (
              <button
                key={c}
                onClick={() => setNewColor(c)}
                style={{ background: c }}
                className={cn(
                  "w-4 h-4 rounded-full border-2 transition-transform",
                  newColor === c ? "border-foreground scale-110" : "border-transparent"
                )}
              />
            ))}
          </div>
          <div className="flex gap-1">
            <button
              onClick={handleCreate}
              disabled={!newName.trim() || createTag.isPending}
              className="flex-1 h-6 text-[10px] bg-primary text-primary-foreground rounded-md font-medium flex items-center justify-center gap-1 disabled:opacity-50"
            >
              <Check size={10} /> Create
            </button>
            <button
              onClick={() => { setShowNew(false); setNewName(""); }}
              className="flex-1 h-6 text-[10px] border border-border rounded-md text-muted-foreground flex items-center justify-center"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
