import { redirect } from "next/navigation";

export default function LegalPage(): never {
    redirect("/legal/terms");
}
