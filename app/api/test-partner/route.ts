import { NextResponse } from "next/server";
import {
  createPartner,
  getPartner,
  updatePartnerStatus,
  deletePartner,
} from "@/lib/partners";

export async function POST() {
  try {
    const partner = await createPartner();

    return NextResponse.json({
      message: "Partner created",
      partner,
    });
  } catch (error) {
    console.error("POST /api/test-partner error:", error);

    return NextResponse.json(
      {
        message: "Failed to create partner",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export async function GET() {
  try {
    const partner = await getPartner();

    return NextResponse.json({
      partner,
    });
  } catch (error) {
    console.error("GET /api/test-partner error:", error);

    return NextResponse.json(
      {
        message: "Failed to get partner",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export async function PATCH() {
  try {
    const partner = await updatePartnerStatus();

    return NextResponse.json({
      message: "Partner updated",
      partner,
    });
  } catch (error) {
    console.error("PATCH /api/test-partner error:", error);

    return NextResponse.json(
      {
        message: "Failed to update partner",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}

export async function DELETE() {
  try {
    const result = await deletePartner();

    return NextResponse.json({
      message: "Partner deleted",
      result,
    });
  } catch (error) {
    console.error("DELETE /api/test-partner error:", error);

    return NextResponse.json(
      {
        message: "Failed to delete partner",
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 },
    );
  }
}
