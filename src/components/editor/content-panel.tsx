"use client";

import * as React from "react";
import { Linkedin, Upload, Plus, GripVertical, X } from "lucide-react";
import type { CardContact, CardDocument, FieldKey } from "@/lib/card-model";
import type { EditorDispatch } from "@/lib/editor-store";
import { Button } from "@/components/ui/button";
import { shortId } from "@/lib/utils";

const FIELDS: { key: FieldKey; label: string; placeholder: string }[] = [
  { key: "name", label: "Full name", placeholder: "Jordan Avery" },
  { key: "title", label: "Job title", placeholder: "Add your title" },
  { key: "company", label: "Company", placeholder: "Add your company" },
  { key: "email", label: "Email", placeholder: "you@company.com" },
  { key: "phone", label: "Phone", placeholder: "+1 (555) 000-0000" },
  { key: "website", label: "Website", placeholder: "yoursite.com" },
  { key: "tagline", label: "Tagline", placeholder: "What you do, in a few words" },
];

export function ContentPanel({
  doc,
  dispatch,
}: {
  doc: CardDocument;
  dispatch: EditorDispatch;
}) {
  const fileRef = React.useRef<HTMLInputElement>(null);
  const linkedInEnabled = process.env.NEXT_PUBLIC_LINKEDIN_ENABLED === "true";

  function onPhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      const photo = doc.elements.find((el) => el.type === "photo");
      if (photo) {
        dispatch({ type: "updateElement", id: photo.id, patch: { src: reader.result as string } });
      }
    };
    reader.readAsDataURL(file);
  }

  async function connectLinkedIn() {
    // Auth.js LinkedIn OIDC (§4.4): requests `openid profile email`, auto-fills
    // name + photo only. Company/title are NOT provided by consumer sign-in.
    if (!linkedInEnabled) return;
    const { signIn } = await import("next-auth/react");
    await signIn("linkedin", { callbackUrl: window.location.href });
  }

  return (
    <div className="space-y-6">
      {/* LinkedIn auto-fill */}
      <div className="rounded-xl border border-border bg-muted/40 p-4">
        <div className="mb-1 flex items-center gap-2 text-sm font-semibold">
          <Linkedin className="size-4 text-[#0a66c2]" /> Auto-fill from LinkedIn
        </div>
        <p className="mb-3 text-xs text-muted-foreground">
          Signs you in with OpenID Connect and fills your <b>name</b> and{" "}
          <b>photo</b>. Job title and company aren&rsquo;t shared by LinkedIn
          sign-in — add those yourself below.
        </p>
        <Button
          size="sm"
          variant="outline"
          className="w-full"
          onClick={connectLinkedIn}
          disabled={!linkedInEnabled}
          title={linkedInEnabled ? undefined : "Set LinkedIn OIDC env vars to enable"}
        >
          <Linkedin className="size-4" />
          {linkedInEnabled ? "Connect with LinkedIn" : "LinkedIn not configured"}
        </Button>
      </div>

      {/* Photo */}
      <div>
        <label className="mb-2 block text-sm font-semibold">Photo</label>
        <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPhoto} />
        <Button variant="outline" size="sm" className="w-full" onClick={() => fileRef.current?.click()}>
          <Upload className="size-4" /> Upload photo
        </Button>
      </div>

      {/* Contact fields */}
      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Details</h3>
        {FIELDS.map((f) => (
          <div key={f.key}>
            <label className="block text-xs text-muted-foreground">{f.label}</label>
            <input
              type="text"
              value={doc.contact[f.key]}
              placeholder={f.placeholder}
              onChange={(e) =>
                dispatch({
                  type: "updateContact",
                  patch: { [f.key]: e.target.value } as Partial<CardContact>,
                  commit: false,
                })
              }
              onBlur={() => dispatch({ type: "updateContact", patch: {}, commit: true })}
              className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm"
            />
          </div>
        ))}
      </div>

      {/* LinkedIn URL for the digital card */}
      <div>
        <label className="block text-xs text-muted-foreground">LinkedIn profile URL</label>
        <input
          type="url"
          value={doc.linkedInUrl ?? ""}
          placeholder="https://linkedin.com/in/you"
          onChange={(e) => dispatch({ type: "replaceDoc", doc: { ...doc, linkedInUrl: e.target.value } })}
          className="w-full rounded-md border border-input bg-background px-2.5 py-1.5 text-sm"
        />
      </div>

      {/* Custom links (§4.6) */}
      <LinksEditor doc={doc} dispatch={dispatch} />
    </div>
  );
}

function LinksEditor({ doc, dispatch }: { doc: CardDocument; dispatch: EditorDispatch }) {
  const links = doc.links;
  const update = (id: string, patch: Partial<{ label: string; url: string }>) =>
    dispatch({
      type: "setLinks",
      links: links.map((l) => (l.id === id ? { ...l, ...patch } : l)),
    });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Buttons on your digital card</h3>
        <Button
          variant="ghost"
          size="sm"
          onClick={() =>
            dispatch({
              type: "setLinks",
              links: [...links, { id: shortId(6), label: "Website", url: "" }],
            })
          }
        >
          <Plus className="size-4" /> Add
        </Button>
      </div>
      {links.length === 0 && (
        <p className="text-xs text-muted-foreground">
          Add a portfolio, booking link, company site — anything you want one tap
          from your card.
        </p>
      )}
      {links.map((l) => (
        <div key={l.id} className="flex items-center gap-1.5">
          <GripVertical className="size-4 shrink-0 text-muted-foreground" />
          <input
            value={l.label}
            placeholder="Label"
            onChange={(e) => update(l.id, { label: e.target.value })}
            className="w-24 rounded-md border border-input bg-background px-2 py-1 text-xs"
          />
          <input
            value={l.url}
            placeholder="https://…"
            onChange={(e) => update(l.id, { url: e.target.value })}
            className="flex-1 rounded-md border border-input bg-background px-2 py-1 text-xs"
          />
          <button
            aria-label="Remove link"
            onClick={() => dispatch({ type: "setLinks", links: links.filter((x) => x.id !== l.id) })}
            className="rounded p-1 text-muted-foreground hover:text-red-500"
          >
            <X className="size-4" />
          </button>
        </div>
      ))}
    </div>
  );
}
