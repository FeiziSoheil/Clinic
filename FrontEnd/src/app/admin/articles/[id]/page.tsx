"use client";

import { useEffect } from "react";
import { useParams, useRouter } from "next/navigation";

/** Legacy path — redirects to `/admin/articles/[id]/edit`. */
export default function EditArticleLegacyRedirect() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  useEffect(() => {
    if (params.id) {
      router.replace(`/admin/articles/${params.id}/edit`);
    }
  }, [params.id, router]);

  return null;
}
