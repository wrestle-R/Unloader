import { browser } from "wxt/browser";
import type { RequestMessage, ResponseMessage } from "./types";

export async function sendRequest<T>(message: RequestMessage): Promise<T> {
  const response = (await browser.runtime.sendMessage(message)) as ResponseMessage<T>;
  if (!response?.ok) {
    throw new Error(response?.error ?? "The extension did not respond.");
  }
  return response.data;
}
