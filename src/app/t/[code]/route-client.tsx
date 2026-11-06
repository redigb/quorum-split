"use client";

import { use } from "react";
import { Table } from "@/components/app/Table";

export function TableRoute({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  return <Table code={code.toUpperCase()} />;
}
