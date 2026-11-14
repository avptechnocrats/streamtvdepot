import { publicApiClient } from "@/api/client";
import { Category } from "@/types/models";

// Public endpoint returns Category[] directly — matches Client's fetchCategories() contract
export async function fetchCategories(): Promise<Category[]> {
  const { data } = await publicApiClient.get<Category[]>("/categories");
  return data ?? [];
}
