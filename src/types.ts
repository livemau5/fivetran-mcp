export interface CatalogEntry {
  method: "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
  path: string;
  summary: string;
  tag: string;
  pathParams: string[];
  queryParams: string[];
  hasBody: boolean;
}
