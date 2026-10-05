import type { Metadata } from "next";
import type { ReactNode } from "react";
import { TasksPage } from "@/Features/Studio/TasksPage";

export const metadata: Metadata = { title: "Tasks" };

export default function TasksPageRoute(): ReactNode {
    return <TasksPage />;
}
