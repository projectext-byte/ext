import { system } from "@minecraft/server";

function getBusyReason(value) {
  return String(
    value?.cancelationReason ??
    value?.cancellationReason ??
    value?.reason ??
    value?.message ??
    value ??
    "",
  );
}

async function ForceOpen(player, form, maxAttempts = 8) {
  const attempts = Math.max(1, Number(maxAttempts) || 1);
  let response;
  let lastError;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      response = await form.show(player);
      lastError = undefined;
      if (!/UserBusy|busy/i.test(getBusyReason(response))) return response;
    } catch (error) {
      lastError = error;
      if (!/UserBusy|busy/i.test(getBusyReason(error))) throw error;
    }

    if (attempt + 1 < attempts) {
      await new Promise(resolve => system.runTimeout(resolve, 2));
    }
  }

  if (lastError && !response) throw lastError;
  return response;
}

export { ForceOpen };
