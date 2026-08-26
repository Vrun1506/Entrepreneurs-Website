"use client";

import type { ComponentProps } from "react";
import UserCard from "./UserCard";
import { bulkApproveUsers, bulkRejectUsers } from "./actions";
import { BulkReview } from "@/app/admin/BulkReview";
import { useUrlFilters } from "@/lib/filters/useUrlFilters";
import { Pager } from "@/components/ui/Pager";

type Item = ComponentProps<typeof UserCard>["member"];

export default function UsersReview({
  items, page, total, pageSize,
}: {
  items: Item[];
  page: number;
  /** The whole queue, not just this page. */
  total: number;
  pageSize: number;
}) {
  const url = useUrlFilters({ navigate: "server" });

  return (
    <>
      <div className={url.pending ? "opacity-60 transition-opacity duration-150" : undefined}>
        {/* "Select all" selects this page. That is the honest meaning of the
            control once the queue is paged, and approving 25 at a time is
            the behaviour a reviewer wants anyway. */}
        <BulkReview
          items={items}
          getId={(m) => m.id}
          renderCard={(m) => <UserCard member={m} />}
          bulkApprove={bulkApproveUsers}
          bulkReject={bulkRejectUsers}
          noun="profile"
        />
      </div>

      <Pager
        url={url}
        page={page}
        total={total}
        pageSize={pageSize}
        label="Review queue pages"
      />
    </>
  );
}
