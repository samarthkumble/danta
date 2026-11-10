import { handle } from "../../_util";
import { resetDemo } from "@/lib/demo";

export const maxDuration = 60;

export const POST = handle(async () => resetDemo());
