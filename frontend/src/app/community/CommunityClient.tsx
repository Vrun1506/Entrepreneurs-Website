"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/Button";
import { loadMoreFeed } from "./actions";
import PostCard from "./PostCard";
import PostComposer from "./PostComposer";
import type { FeedPostView } from "./feedView";

// ════════════════════════════════════════════════════════════════════
// Foundry · The feed
//
// Posts accumulate client-side as the reader pages, because a feed that
// replaces the list on "load more" loses your place. The cursor is opaque
// and comes from the server; this component never constructs one.
//
// The list is owned by this component from mount onward, and every change
// to it is applied here directly: a new post is prepended from what the
// action returned, a deleted one is filtered out.
//
// It deliberately does NOT lean on router.refresh() to show a new post.
// useState seeds from props once and React ignores prop changes after
// mount, so a refreshed server render never reaches this list — which is
// exactly the bug the E2E suite caught: posting worked, and the card only
// appeared after a hard reload. revalidatePath still runs in the action so
// the *next* navigation is correct.
// ════════════════════════════════════════════════════════════════════

export default function CommunityClient({
  initialPosts,
  initialCursor,
  currentUserId,
  isAdmin,
  uploadsAvailable,
}: {
  initialPosts: FeedPostView[];
  initialCursor: string | null;
  currentUserId: string;
  isAdmin: boolean;
  uploadsAvailable: boolean;
}) {
  const router = useRouter();
  const [posts, setPosts] = useState(initialPosts);
  const [cursor, setCursor] = useState(initialCursor);
  const [error, setError] = useState("");
  const [pending, start] = useTransition();
  const [composerOpen, setComposerOpen] = useState(false);

  const removePost = (id: string) => {
    setPosts((prev) => prev.filter((p) => p.id !== id));
    router.refresh();
  };

  return (
    <div className="space-y-6">
      <nav aria-label="Community actions" className="flex justify-end gap-2">
        <Link
          href="/community/mine"
          className="rounded-lg border border-border-strong bg-white/[0.03] px-4 py-2 text-[0.8rem] text-text-secondary transition-colors hover:border-accent hover:text-text-primary"
        >
          My posts
        </Link>
        <Button variant={composerOpen ? "ghost" : "primary"} size="sm" onClick={() => setComposerOpen((v) => !v)}>
          {composerOpen ? "Cancel" : "Create a post"}
        </Button>
      </nav>

      {composerOpen && (
        <PostComposer
          uploadsAvailable={uploadsAvailable}
          onPosted={(post) => {
            setPosts((prev) => [post, ...prev]);
            setComposerOpen(false);
          }}
        />
      )}

      {posts.length === 0 ? (
        <p className="rounded-xl border border-border-subtle bg-white/[0.02] px-6 py-12 text-center text-[0.875rem] text-text-secondary">
          Nothing here yet. Be the first to post something.
        </p>
      ) : (
        <div className="space-y-4">
          {posts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              currentUserId={currentUserId}
              isAdmin={isAdmin}
              onRemoved={removePost}
            />
          ))}
        </div>
      )}

      {error && (
        <p className="rounded-lg border border-[#ff4d4d]/30 bg-[#ff4d4d]/8 px-3 py-2 text-[0.8rem] text-[#ff6b6b]">
          {error}
        </p>
      )}

      {cursor && (
        <div className="flex justify-center">
          <Button
            variant="ghost"
            size="sm"
            loading={pending}
            onClick={() =>
              start(async () => {
                setError("");
                const res = await loadMoreFeed(cursor);
                if (!res.ok) { setError(res.error); return; }
                setPosts((prev) => [...prev, ...res.data.posts]);
                setCursor(res.data.nextCursor);
              })
            }
          >
            Load more
          </Button>
        </div>
      )}
    </div>
  );
}
