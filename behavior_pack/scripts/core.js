import { system, world, Player, BlockTypes, EnchantmentType, EnchantmentTypes, ItemStack, Entity, Container, Component, ScoreboardIdentity, Dimension, Block, CommandPermissionLevel, CustomCommandParamType, CustomCommandStatus, ItemLockMode, EquipmentSlot, EntityComponentTypes, ItemComponentTypes } from "@minecraft/server"
import { ActionFormData as MinecraftActionFormData, ModalFormData as MinecraftModalFormData, MessageFormData as MinecraftMessageFormData, FormCancelationReason, CustomForm, ObservableBoolean, ObservableNumber, ObservableString } from "@minecraft/server-ui"

const KIW_ACTION_LINEAR_MARKER = "\u00A7k\u00A7l\u00A7i\u00A7n\u00A7r";

function sanitizeFormTitle(text) {
  if (typeof text !== "string") return text;
  return text
    .replace(/\[\[(?:sethome|player_shop)[^\]]*\]\]/gi, "")
    .replace(/[GS]ETHOME_(?:MENU|TELEPORT_GRID|MORNING|DAY|EVENING|NIGHT)/gi, "")
    .replace(/PLAYER_SHOP(?:_MENU)?/gi, "")
    .replace(/^[\s_\[\]]+/, "")
    .trim();
}

function formFailureReason(value) {
  return String(value?.cancelationReason ?? value?.cancellationReason ?? value?.reason ?? value?.message ?? value ?? "");
}

async function showWithRetry(form, player, maxAttempts = 8) {
  const attempts = Math.max(1, Number(maxAttempts) || 1);
  let lastResponse;
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      lastResponse = await form.show(player);
      lastError = undefined;
      if (!/UserBusy|busy/i.test(formFailureReason(lastResponse))) return lastResponse;
    } catch (error) {
      lastError = error;
      if (!/UserBusy|busy/i.test(formFailureReason(error))) throw error;
    }
    if (attempt + 1 < attempts) await new Promise(resolve => system.runTimeout(resolve, 2));
  }
  if (lastError && !lastResponse) throw lastError;
  return lastResponse;
}

class ActionFormData {
  constructor() {
    this._form = new MinecraftActionFormData();
    this._kiwTitleText = undefined;
    this._kiwNeedsLinearLayout = false;
  }

  title(text) {
    const cleanText = sanitizeFormTitle(text);
    this._kiwTitleText = cleanText;
    this._form.title(cleanText);
    return this;
  }

  body(text) {
    this._form.body(text);
    return this;
  }

  button(text, iconPath) {
    if (iconPath === undefined) {
      this._form.button(text);
    } else {
      this._form.button(text, iconPath);
    }
    return this;
  }

  divider() {
    this._kiwNeedsLinearLayout = true;
    this._form.divider();
    return this;
  }

  header(text) {
    this._kiwNeedsLinearLayout = true;
    this._form.header(text);
    return this;
  }

  label(text) {
    this._kiwNeedsLinearLayout = true;
    this._form.label(text);
    return this;
  }

  spacer() {
    this._kiwNeedsLinearLayout = true;
    this._form.spacer();
    return this;
  }

  show(player) {
    if (
      this._kiwNeedsLinearLayout &&
      typeof this._kiwTitleText === "string" &&
      !this._kiwTitleText.startsWith(KIW_ACTION_LINEAR_MARKER)
    ) {
      this._form.title(`${KIW_ACTION_LINEAR_MARKER}${this._kiwTitleText}`);
    }
    return showWithRetry(this._form, player);
  }
}

class ModalFormData {
  constructor() {
    this._form = new MinecraftModalFormData();
  }
  title(text) { this._form.title(sanitizeFormTitle(text)); return this; }
  body(text) { this._form.body(text); return this; }
  textField(...args) { this._form.textField(...args); return this; }
  dropdown(...args) { this._form.dropdown(...args); return this; }
  toggle(...args) { this._form.toggle(...args); return this; }
  slider(...args) { this._form.slider(...args); return this; }
  submitButton(...args) { this._form.submitButton(...args); return this; }
  divider(...args) { this._form.divider(...args); return this; }
  header(...args) { this._form.header(...args); return this; }
  label(...args) { this._form.label(...args); return this; }
  spacer(...args) { this._form.spacer(...args); return this; }
  show(player) { return showWithRetry(this._form, player); }
}

class MessageFormData {
  constructor() {
    this._form = new MinecraftMessageFormData();
  }
  title(text) { this._form.title(sanitizeFormTitle(text)); return this; }
  body(text) { this._form.body(text); return this; }
  button1(text) { this._form.button1(text); return this; }
  button2(text) { this._form.button2(text); return this; }
  show(player) { return showWithRetry(this._form, player); }
}

export { system, world, Player, Entity, BlockTypes, ItemStack, Block, Dimension, Container, Component, ScoreboardIdentity, ActionFormData, ModalFormData, MessageFormData, FormCancelationReason, CustomForm, ObservableBoolean, ObservableNumber, ObservableString, EnchantmentType, EnchantmentTypes, CommandPermissionLevel, CustomCommandParamType, CustomCommandStatus, ItemLockMode, EquipmentSlot, EntityComponentTypes, ItemComponentTypes }
