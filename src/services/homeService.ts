import { publicApiClient } from "@/api/client";
import { HomeRow } from "@/types/models";

interface HomeResponse {
  rows: HomeRow[];
}

interface FetchHomeRowsParams {
  contentType?: string;
  page?: number;
  pageSize?: number;
  itemsPerRow?: number;
}

export async function fetchHomeRows(params: FetchHomeRowsParams = {}): Promise<HomeRow[]> {
  const {
    contentType = "video",
    page = 1,
    pageSize = 6,
    itemsPerRow = 12,
  } = params;

  const { data } = await publicApiClient.get<HomeResponse>("/home-contents", {
    params: {
      content_type: contentType,
      page,
      page_size: pageSize,
      items_per_row: itemsPerRow,
    },
  });

  return data.rows ?? [];
}
