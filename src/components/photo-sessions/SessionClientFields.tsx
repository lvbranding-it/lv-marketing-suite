import { useMemo, useState } from "react";
import { Check, ChevronsUpDown, Link2, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useImportedContacts } from "@/hooks/useContacts";
import {
  contactDetail,
  contactName,
  searchContacts,
  type ClientContact,
  type SessionClient,
} from "@/lib/photo-sessions/clients";

// More than this many in a group is cut, so the list stays quick to open.
const GROUP_LIMIT = 100;

interface SessionClientFieldsProps {
  idPrefix: string;
  value: SessionClient;
  onChange: (client: SessionClient) => void;
  errors?: { name?: string; email?: string } | null;
}

/**
 * The client of a photo session: chosen from the contacts, or added to them.
 * Clients (contacts marked won) are listed before everyone else.
 */
export default function SessionClientFields({ idPrefix, value, onChange, errors }: SessionClientFieldsProps) {
  const { data: contacts = [], isLoading } = useImportedContacts();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const { clients, others } = useMemo(() => searchContacts(contacts, query), [contacts, query]);
  const chosen = value.contactId ? contacts.find((contact) => contact.id === value.contactId) : undefined;

  // Someone typed in as new who is already in the contacts, by email or by name.
  const alreadyThere = useMemo(() => {
    if (!value.adding) return undefined;
    const email = value.email.trim().toLowerCase();
    const name = value.name.trim().toLowerCase();
    return (
      (email && contacts.find((contact) => contact.email?.trim().toLowerCase() === email)) ||
      (name && contacts.find((contact) => contactName(contact).toLowerCase() === name)) ||
      undefined
    );
  }, [contacts, value.adding, value.email, value.name]);

  // An email typed for the session carries over to the next choice; one that
  // came with a chosen contact does not, or it would be saved to someone else.
  const typedEmail = value.contactId ? "" : value.email;

  const choose = (contact: ClientContact) => {
    onChange({
      contactId: contact.id,
      name: contactName(contact),
      email: contact.email?.trim() || typedEmail,
      adding: false,
    });
    setOpen(false);
    setQuery("");
  };

  const addNew = () => {
    onChange({ contactId: null, name: query.trim(), email: typedEmail, adding: true });
    setOpen(false);
    setQuery("");
  };

  const renderContact = (contact: ClientContact) => {
    const detail = contactDetail(contact);
    return (
      <CommandItem key={contact.id} value={contact.id} onSelect={() => choose(contact)} className="items-start py-2">
        <Check className={`mt-0.5 ${contact.id === value.contactId ? "opacity-100" : "opacity-0"}`} />
        <div className="min-w-0">
          <p className="truncate">{contactName(contact)}</p>
          {detail && <p className="truncate text-xs text-muted-foreground">{detail}</p>}
        </div>
      </CommandItem>
    );
  };

  const triggerDetail = chosen ? contactDetail(chosen) : value.email;

  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-client`}>
          Client <span className="text-destructive">*</span>
        </Label>

        {value.adding ? (
          <div className="space-y-2 rounded-md border border-dashed p-3">
            <Input
              id={`${idPrefix}-client`}
              placeholder="Client name"
              value={value.name}
              onChange={(e) => onChange({ ...value, name: e.target.value })}
              autoFocus={!value.name}
            />
            {alreadyThere ? (
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
                <span>
                  {contactName(alreadyThere)} is already in Contacts.
                </span>
                <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={() => choose(alreadyThere)}>
                  Use this contact
                </Button>
              </div>
            ) : (
              <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <UserPlus size={12} className="shrink-0" />
                Saving adds them to Contacts as a client.
              </p>
            )}
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs"
              onClick={() => onChange({ ...value, adding: false, contactId: null, name: "" })}
            >
              Choose from Contacts instead
            </Button>
          </div>
        ) : (
          <Popover open={open} onOpenChange={setOpen} modal>
            <PopoverTrigger asChild>
              <Button
                id={`${idPrefix}-client`}
                type="button"
                variant="outline"
                role="combobox"
                aria-expanded={open}
                className="h-auto min-h-9 w-full justify-between gap-2 px-3 py-1.5 font-normal"
              >
                {value.contactId ? (
                  <span className="flex min-w-0 flex-col items-start text-left">
                    <span className="flex max-w-full items-center gap-1.5">
                      <Link2 size={12} className="shrink-0 text-muted-foreground" />
                      <span className="truncate">{value.name}</span>
                    </span>
                    {triggerDetail && <span className="max-w-full truncate text-xs text-muted-foreground">{triggerDetail}</span>}
                  </span>
                ) : (
                  <span className="text-muted-foreground">Choose a client</span>
                )}
                <ChevronsUpDown size={14} className="shrink-0 opacity-50" />
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="start"
              collisionPadding={8}
              className="flex max-h-[min(24rem,var(--radix-popover-content-available-height))] w-[--radix-popover-trigger-width] min-w-[16rem] flex-col p-0"
            >
              <Command shouldFilter={false} className="min-h-0">
                <CommandInput
                  placeholder="Search name, company or email"
                  value={query}
                  onValueChange={setQuery}
                  className="text-base md:text-sm"
                />
                <CommandList className="max-h-none min-h-0 flex-1">
                  {isLoading ? (
                    <p className="py-6 text-center text-sm text-muted-foreground">Loading contacts…</p>
                  ) : clients.length + others.length === 0 ? (
                    <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                      {query.trim() ? `No contact matches "${query.trim()}".` : "No contacts yet."}
                    </p>
                  ) : null}
                  {clients.length > 0 && (
                    <CommandGroup heading="Clients">{clients.slice(0, GROUP_LIMIT).map(renderContact)}</CommandGroup>
                  )}
                  {others.length > 0 && (
                    <CommandGroup heading="Other contacts">{others.slice(0, GROUP_LIMIT).map(renderContact)}</CommandGroup>
                  )}
                </CommandList>
                <button
                  type="button"
                  onClick={addNew}
                  className="flex w-full items-center gap-2 border-t px-3 py-2.5 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                >
                  <UserPlus size={14} className="shrink-0 text-primary" />
                  <span className="truncate">
                    {query.trim() ? `Add "${query.trim()}" as a new client` : "Add a new client"}
                  </span>
                </button>
              </Command>
            </PopoverContent>
          </Popover>
        )}
        {errors?.name && <p className="text-xs text-destructive">{errors.name}</p>}
      </div>

      <div className="space-y-1.5">
        <Label htmlFor={`${idPrefix}-client-email`}>Client Email</Label>
        <Input
          id={`${idPrefix}-client-email`}
          type="email"
          placeholder="jane@example.com"
          value={value.email}
          onChange={(e) => onChange({ ...value, email: e.target.value })}
        />
        {errors?.email ? (
          <p className="text-xs text-destructive">{errors.email}</p>
        ) : chosen && !chosen.email?.trim() && value.email.trim() ? (
          <p className="text-xs text-muted-foreground">Also saved to their contact, which has no email yet.</p>
        ) : null}
      </div>
    </>
  );
}
