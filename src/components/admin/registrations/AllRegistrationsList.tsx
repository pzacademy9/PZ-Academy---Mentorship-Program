"use client";

import { useState, type ComponentProps } from "react";
import { MessageBuilder } from "./MessageBuilder";
import { RegistrationsTable } from "./RegistrationsTable";
import { RowActions } from "./RowActions";
import type { BuilderChannel, CampaignBuilderRequest } from "./CampaignRegistrations";

/** The admin "all registrations" list: the table with a menu on every row, and the message writer for one person. */
export function AllRegistrationsList(props: Omit<ComponentProps<typeof RegistrationsTable>, "rowActions" | "selectable">) {
  const [builder, setBuilder] = useState<{ channel: BuilderChannel; request: CampaignBuilderRequest } | null>(null);
  return (
    <>
      <RegistrationsTable
        {...props}
        rowActions={(r) => <RowActions row={r} onOpenBuilder={(channel, request) => setBuilder({ channel, request })} />}
      />
      {builder && (
        <MessageBuilder
          channel={builder.channel}
          request={builder.request}
          onClose={(sent) => {
            setBuilder(null);
            if (sent) window.location.reload();
          }}
        />
      )}
    </>
  );
}
