"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import {
  createArticle,
  deleteArticle,
  getArticle,
  listArticles,
  publishArticle,
  updateArticle,
} from "../services/article-api";
import type { ArticleInput, ArticleListParams } from "../types/article";

export const articleKeys = {
  all: ["cms-articles"] as const,
  list: (params: ArticleListParams) =>
    ["cms-articles", "list", params] as const,
  detail: (id: string) => ["cms-articles", "detail", id] as const,
};

export function useArticles(params: ArticleListParams = {}) {
  return useQuery({
    queryKey: articleKeys.list(params),
    queryFn: () => listArticles(params),
  });
}

export function useArticle(id: string | undefined) {
  return useQuery({
    queryKey: articleKeys.detail(id ?? ""),
    queryFn: () => getArticle(id!),
    enabled: Boolean(id),
  });
}

export function useCreateArticle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ArticleInput) => createArticle(input),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: articleKeys.all });
      toast.success("مقاله ایجاد شد");
    },
    onError: () => toast.error("ایجاد مقاله ناموفق بود"),
  });
}

export function useUpdateArticle(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ArticleInput) => updateArticle(id, input),
    onSuccess: (article) => {
      void qc.invalidateQueries({ queryKey: articleKeys.all });
      qc.setQueryData(articleKeys.detail(id), article);
      toast.success("تغییرات ذخیره شد");
    },
    onError: () => toast.error("ذخیره ناموفق بود"),
  });
}

/** Silent autosave — updates cache only; no toast or list invalidation. */
export function useAutosaveArticle(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ArticleInput) => updateArticle(id, input),
    onSuccess: (article) => {
      qc.setQueryData(articleKeys.detail(id), article);
    },
  });
}

export function useDeleteArticle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteArticle(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: articleKeys.all });
      toast.success("مقاله حذف شد");
    },
    onError: () => toast.error("حذف ناموفق بود"),
  });
}

export function usePublishArticle() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => publishArticle(id),
    onSuccess: (article) => {
      void qc.invalidateQueries({ queryKey: articleKeys.all });
      qc.setQueryData(articleKeys.detail(article.id), article);
      toast.success("مقاله منتشر شد");
    },
    onError: () => toast.error("انتشار ناموفق بود"),
  });
}
