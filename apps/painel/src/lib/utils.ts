import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatMinutesToHours(minutes: number): string {
  if (!minutes) return "0m";
  if (minutes < 60) return `${minutes}m`;
  
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  
  // Ex: "5h 31m" ou "1h 05m"
  return `${hours}h ${mins.toString().padStart(2, '0')}m`;
}
