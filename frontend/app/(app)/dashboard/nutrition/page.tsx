import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import MealAnalysis from "./meal-analysis";
import { nutritionDemoMode } from "@/lib/nutrition";

export default async function NutritionPage() {
  if (nutritionDemoMode) return <MealAnalysis />;
  const { data: { user } } = await (await createClient()).auth.getUser();
  if (!user) redirect("/login");
  return <MealAnalysis />;
}
