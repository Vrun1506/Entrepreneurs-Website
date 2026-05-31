"use client";

import type { ComponentProps } from "react";
import UserCard from "./UserCard";
import { bulkApproveUsers, bulkRejectUsers } from "./actions";
import { BulkReview } from "@/app/admin/BulkReview";

type Item = ComponentProps<typeof UserCard>["member"];

export default function UsersReview({ items }: { items: Item[] }) {
  return (
    <BulkReview
      items={items}
      getId={(m) => m.id}
      renderCard={(m) => <UserCard member={m} />}
      bulkApprove={bulkApproveUsers}
      bulkReject={bulkRejectUsers}
      noun="profile"
    />
  );
}
