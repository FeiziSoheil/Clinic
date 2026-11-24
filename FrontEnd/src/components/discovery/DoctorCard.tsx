"use client";

import type { Doctor } from "@/types/doctor";
import {
  DoctorCard as SharedDoctorCard,
  DoctorCardSkeleton as SharedDoctorCardSkeleton,
  mapDiscoveryDoctorToCard,
} from "@/components/doctors";

export interface DoctorCardProps {
  doctor: Doctor;
  firstAvailable?: string;
  onlineConsult?: boolean;
  className?: string;
}

export function DoctorCard({
  doctor,
  firstAvailable,
  onlineConsult,
  className,
}: DoctorCardProps) {
  const model = mapDiscoveryDoctorToCard(doctor, {
    firstAvailable,
    onlineConsult,
  });
  return <SharedDoctorCard {...model} locale="fa" className={className} />;
}

export function DoctorCardSkeleton() {
  return <SharedDoctorCardSkeleton />;
}
