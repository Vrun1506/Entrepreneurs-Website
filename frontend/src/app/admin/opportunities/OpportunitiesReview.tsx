"use client";

import type { ComponentProps } from "react";
import OpportunityReviewCard from "./OpportunityReviewCard";
import { bulkApproveOpportunities, bulkRejectOpportunities } from "./actions";
import { BulkReview } from "@/app/admin/BulkReview";

type Item = ComponentProps<typeof OpportunityReviewCard>["opportunity"];

export default function OpportunitiesReview({ items }: { items: Item[] }) {
  return (
    <BulkReview
      items={items}
      getId={(o) => o.id}
      renderCard={(o) => <OpportunityReviewCard opportunity={o} />}
      bulkApprove={bulkApproveOpportunities}
      bulkReject={bulkRejectOpportunities}
      noun="opportunity"
      emptyMessage="Nothing pending. The queue is clear."
    />
  );
}
