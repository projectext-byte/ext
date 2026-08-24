import { world, system, ActionFormData, ModalFormData, MessageFormData } from "../../core.js";
import { GlobalConfig } from "../../function/GlobalConfig.js";
import { ForceOpen } from "../../function/ForceOpen.js";

const SERVER_LOGS = [];
const ACTIVE_UIS = new Set();
const NEXT_PROMPT_TICK = new Map();
const INVALID_ACCOUNT_PLAYERS = new Set();
const PROMPT_RETRY_TICKS = 20;
const SPAWN_PROMPT_DELAY_TICKS = 30;
const AUTH_TITLES = {
  register: "§fAuth Register",
  login: "§fAuth Login",
};

const getAppConfig = () => ({
  adminTag: GlobalConfig.get("cfg:admin_tag") ?? "admin",
  systemDB: GlobalConfig.get("cfg:sys_db") ?? "sys:auth_enabled",
  playerDB: GlobalConfig.get("cfg:plr_db") ?? "player:auth_data",
  sessionDB: GlobalConfig.get("cfg:ses_db") ?? "player:is_logged_in",
});

const getPlayerKey = (player) => player?.id ?? player?.name ?? null;

function clearPlayerUiState(playerOrId) {
  const key = typeof playerOrId === "string" ? playerOrId : getPlayerKey(playerOrId);
  if (!key) return;
  ACTIVE_UIS.delete(key);
  NEXT_PROMPT_TICK.delete(key);
  INVALID_ACCOUNT_PLAYERS.delete(key);
}

function setPromptCooldown(player, ticks = PROMPT_RETRY_TICKS) {
  const key = getPlayerKey(player);
  if (!key) return;
  NEXT_PROMPT_TICK.set(key, system.currentTick + ticks);
}

function canPromptPlayer(player) {
  const key = getPlayerKey(player);
  if (!key || ACTIVE_UIS.has(key)) return false;
  return (NEXT_PROMPT_TICK.get(key) ?? 0) <= system.currentTick;
}

function parseAccountData(raw) {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed.u !== "string" || typeof parsed.p !== "string") {
      return null;
    }
    return {
      u: parsed.u,
      p: parsed.p,
      date: typeof parsed.date === "string" ? parsed.date : "",
    };
  } catch {
    return null;
  }
}

function notify(player, message) {
  try {
    player.onScreenDisplay.setActionBar(`\u00A7b[AUTH]\u00A7r ${message}`);
  } catch {
    try {
      player.sendMessage(`[AUTH] ${message.replace(/\u00A7./g, "")}`);
    } catch {}
  }
}

function playSound(player, sound) {
  try {
    player.playSound(sound);
  } catch {}
}

function addLog(message) {
  const time = new Date().toLocaleTimeString("en-US", { hour12: false });
  SERVER_LOGS.push(`\u00A78[${time}]\u00A7r ${message}`);
}

function enforceSecurity(player) {
  try {
    player.addEffect("slowness", 45, { amplifier: 255, showParticles: false });
    player.addEffect("blindness", 45, { amplifier: 255, showParticles: false });
    player.addEffect("weakness", 45, { amplifier: 255, showParticles: false });
  } catch {}
}

function sendWelcomeMessage(player, user, pass) {
  player.sendMessage(
    `\n\u00A7b======================================\n ACCOUNT REGISTERED\n\n\u00A77 ID: \u00A7f${user}\n\u00A77 Pass: \u00A7f${pass}\n\n\u00A7c KEEP SAFE!\n\u00A7b======================================\n`,
  );
}

async function showLockedForm(player, form) {
  const key = getPlayerKey(player);
  if (!key || !player?.isValid) return null;

  ACTIVE_UIS.add(key);
  try {
    return await ForceOpen(player, form);
  } catch (error) {
    console.warn("Auth UI error:", error);
    notify(player, "\u00A7cFailed to open auth UI. Retrying...");
    return null;
  } finally {
    ACTIVE_UIS.delete(key);
    setPromptCooldown(player);
  }
}

async function RegisterUI(player) {
  const result = await showLockedForm(
    player,
    new ModalFormData()
      .title(AUTH_TITLES.register)
      .textField(
        "\u00A7aStep 1: Username",
        "Enter username...",
      )
      .textField(
        "\u00A7aStep 2: Password",
        "Enter password...",
      )
      .toggle("\u00A76I agree to server policies", { defaultValue: false })
      .submitButton("REGISTER"),
  );

  if (!result || result.canceled) return;

  const [rawUser, rawPass, agreed] = result.formValues ?? [];
  const user = typeof rawUser === "string" ? rawUser.trim() : "";
  const pass = typeof rawPass === "string" ? rawPass.trim() : "";

  if (!agreed || !user || !pass) {
    notify(player, "\u00A7cRegistration failed. Fill all fields first.");
    playSound(player, "mob.villager.no");
    setPromptCooldown(player, 10);
    return;
  }

  const config = getAppConfig();
  const account = { u: user, p: pass, date: new Date().toLocaleDateString() };

  system.run(() => {
    try {
      player.setDynamicProperty(config.playerDB, JSON.stringify(account));
      player.setDynamicProperty(config.sessionDB, true);
      notify(player, "\u00A7aRegistration complete.");
      playSound(player, "random.levelup");
      sendWelcomeMessage(player, user, pass);
      addLog(`[REGISTER] ${player.name} as ${user}`);
    } catch (error) {
      console.warn("Registration save error:", error);
      notify(player, "\u00A7cFailed to save account data.");
    }
  });
}

async function LoginUI(player, accountData) {
  const description =
    `\u00A7ePassword for \u00A7f${accountData.u}`;

  const result = await showLockedForm(
    player,
    new ModalFormData()
      .title(AUTH_TITLES.login)
      .textField(description, "Enter password...")
      .submitButton("LOGIN"),
  );

  if (!result || result.canceled) return;

  const [rawPass] = result.formValues ?? [];
  const pass = typeof rawPass === "string" ? rawPass.trim() : "";

  if (!pass) {
    notify(player, "\u00A7cPassword cannot be empty.");
    playSound(player, "mob.villager.no");
    setPromptCooldown(player, 10);
    return;
  }

  if (pass === accountData.p) {
    const config = getAppConfig();
    system.run(() => {
      try {
        player.setDynamicProperty(config.sessionDB, true);
        notify(player, "\u00A7aAccess granted. Welcome back.");
        playSound(player, "random.orb");
        addLog(`[LOGIN] ${player.name} verified.`);
      } catch (error) {
        console.warn("Login completion error:", error);
        notify(player, "\u00A7cFailed to finalize login.");
      }
    });
    return;
  }

  notify(player, "\u00A7cVerification failed.");
  playSound(player, "mob.villager.no");
  setPromptCooldown(player, 10);
}

export async function AdminDashboardUI(player) {
  const config = getAppConfig();
  const isSystemOn = GlobalConfig.get(config.systemDB) ?? false;
  const result = await showLockedForm(
    player,
    new ActionFormData()
      .title("\u00A7fNetwork Admin")
      .body(`\u00A77Status: ${isSystemOn ? "\u00A7aONLINE" : "\u00A7cOFFLINE"}\n\u00A77Admin Tag: \u00A7b${config.adminTag}`)
      .button("\u00A7fConfig\n\u00A77Keys & Tags", "textures/ui/button_custom/settings")
      .button("\u00A7fUsers\n\u00A77Reset Accounts", "textures/ui/button_custom/op")
      .button("\u00A7fLogs\n\u00A77System Activity", "textures/items/book_normal")
      .button(
        `\u00A7fToggle\n${isSystemOn ? "\u00A7aEnabled" : "\u00A7cDisabled"}`,
        isSystemOn ? "textures/ui/toggle/on" : "textures/ui/toggle/off",
      ),
  );

  if (!result || result.canceled) return;

  switch (result.selection) {
    case 0:
      await AdminConfigUI(player);
      break;
    case 1:
      await AdminResetUI(player);
      break;
    case 2:
      await AdminLogsUI(player);
      break;
    case 3:
      system.run(() => {
        GlobalConfig.set(config.systemDB, !isSystemOn);
        notify(player, `System: ${!isSystemOn ? "\u00A7aON" : "\u00A7cOFF"}`);
      });
      break;
  }
}

async function AdminConfigUI(player) {
  const current = getAppConfig();
  const isSystemOn = GlobalConfig.get(current.systemDB) ?? false;
  const result = await showLockedForm(
    player,
    new ModalFormData()
      .title("\u00A7fCore Settings")
      .textField("Admin Tag", "admin", { defaultValue: current.adminTag })
      .textField("System Key", "sys_db", { defaultValue: current.systemDB })
      .textField("Account Key", "plr_db", { defaultValue: current.playerDB })
      .textField("Session Key", "ses_db", { defaultValue: current.sessionDB })
      .toggle("System Enabled", { defaultValue: isSystemOn }),
  );

  if (!result || result.canceled) return;

  const [tag, sys, plr, ses, enabled] = result.formValues ?? [];
  system.run(() => {
    GlobalConfig.set("cfg:admin_tag", tag);
    GlobalConfig.set("cfg:sys_db", sys);
    GlobalConfig.set("cfg:plr_db", plr);
    GlobalConfig.set("cfg:ses_db", ses);
    GlobalConfig.set(sys, enabled);
    notify(player, "\u00A7aParameters updated.");
  });
}

async function AdminResetUI(admin) {
  const players = world.getPlayers();
  const names = players.map((player) => player.name);
  const result = await showLockedForm(
    admin,
    new ModalFormData()
      .title("\u00A7fPurge Data")
      .dropdown("Select Player", names)
      .toggle("\u00A7cConfirm Wipe?", { defaultValue: false }),
  );

  if (!result || result.canceled) return;

  const [index, confirm] = result.formValues ?? [];
  const target = players[index];
  if (!target || !confirm) return;

  system.run(() => {
    const config = getAppConfig();
    target.setDynamicProperty(config.playerDB, undefined);
    target.setDynamicProperty(config.sessionDB, false);
    clearPlayerUiState(target);
    notify(admin, `\u00A7a${target.name} purged.`);
    notify(target, "\u00A77Account reset by admin.");
    addLog(`[RESET] Admin ${admin.name} purged ${target.name}`);
  });
}

async function AdminLogsUI(player) {
  await showLockedForm(
    player,
    new MessageFormData()
      .title("\u00A7fSecurity Logs")
      .body(SERVER_LOGS.slice(-15).join("\n") || "\u00A77No logs.")
      .button1("Close")
      .button2("Refresh"),
  );
}

system.runInterval(() => {
  const config = getAppConfig();
  const isSystemActive = GlobalConfig.get(config.systemDB) ?? false;
  if (!isSystemActive) return;

  for (const player of world.getPlayers()) {
    const key = getPlayerKey(player);
    if (!player.name || !key) continue;

    const isAuthenticated = player.getDynamicProperty(config.sessionDB) ?? false;
    if (isAuthenticated) {
      NEXT_PROMPT_TICK.delete(key);
      continue;
    }

    enforceSecurity(player);
    if (!canPromptPlayer(player)) continue;

    const rawAccountData = player.getDynamicProperty(config.playerDB);
    const accountData = parseAccountData(rawAccountData);
    if (rawAccountData && !accountData) {
      if (!INVALID_ACCOUNT_PLAYERS.has(key)) {
        INVALID_ACCOUNT_PLAYERS.add(key);
        addLog(`[AUTH] Invalid account data for ${player.name}, redirecting to register.`);
      }
    } else {
      INVALID_ACCOUNT_PLAYERS.delete(key);
    }

    if (accountData) {
      LoginUI(player, accountData);
    } else {
      RegisterUI(player);
    }
  }
}, 40);

world.afterEvents.playerSpawn.subscribe(({ player, initialSpawn }) => {
  if (!initialSpawn) return;

  system.run(() => {
    const config = getAppConfig();
    clearPlayerUiState(player);
    player.setDynamicProperty(config.sessionDB, false);
    setPromptCooldown(player, SPAWN_PROMPT_DELAY_TICKS);
    notify(player, "\u00A7eEstablishing secure tunnel...");
  });
});

world.beforeEvents.playerLeave.subscribe(({ playerId }) => {
  clearPlayerUiState(playerId);
});
