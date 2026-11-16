import { redirect } from "next/navigation";

export default function MePage(): never {
    redirect("/profile");
}
