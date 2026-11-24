const STORAGE_KEY = "barberiaReservas.v1";
const CLIENT_DATA_KEY = "barberiaReservas.clientData";
const ADMIN_KEY = "barberiaReservas.pin";
const SETTINGS_VERSION = 4;
const AGENDA_REFRESH_MS = 5000;

const dayNames = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const urlParams = new URLSearchParams(window.location.search);
const hashParams = new URLSearchParams(window.location.hash.slice(1));
const recoveryMode =
  urlParams.get("type") === "recovery" ||
  hashParams.get("type") === "recovery" ||
  Boolean(urlParams.get("code"));
const adminMode = urlParams.get("admin") === "1" || recoveryMode;
const manageToken = urlParams.get("reserva") || "";

const mvpService = { id: "", name: "Corte", duration: 30, price: 0, active: true, sortOrder: 10 };

const defaultState = {
  settingsVersion: SETTINGS_VERSION,
  config: {
    maxDaysAhead: 21,
    slotStep: 30,
    notificationEmail: "barberia.marianomartinez@gmail.com",
    businessAddress: "",
    mapsUrl: "https://maps.app.goo.gl/UzPPS1nmSLwza3BL9?g_st=ic",
    hours: {
      0: { open: false, start: "13:00", end: "21:00", breakStart: "", breakEnd: "" },
      1: { open: false, start: "13:00", end: "21:00", breakStart: "", breakEnd: "" },
      2: { open: true, start: "13:00", end: "21:00", breakStart: "", breakEnd: "" },
      3: { open: true, start: "13:00", end: "21:00", breakStart: "", breakEnd: "" },
      4: { open: true, start: "13:00", end: "21:00", breakStart: "", breakEnd: "" },
      5: { open: true, start: "13:00", end: "21:00", breakStart: "", breakEnd: "" },
      6: { open: true, start: "13:00", end: "21:00", breakStart: "", breakEnd: "" }
    }
  },
  availabilityOverrides: {},
  blockedSlots: [],
  services: [
    { ...mvpService, id: createId() }
  ],
  reservations: []
};

const supabaseConfig = window.BARBERIA_SUPABASE || {};
const supabaseClient =
  supabaseConfig.url &&
  supabaseConfig.anonKey &&
  !supabaseConfig.url.includes("TU-PROYECTO") &&
  window.supabase
    ? window.supabase.createClient(supabaseConfig.url, supabaseConfig.anonKey)
    : null;

const dataMode = supabaseClient ? "online" : "local";
const isLocalPreview =
  window.location.protocol === "file:" ||
  ["localhost", "127.0.0.1", "0.0.0.0"].includes(window.location.hostname);
const onlineRequired = !isLocalPreview;
let onlineUnavailable = onlineRequired && !supabaseClient;
let state = structuredClone(defaultState);
let selectedSlot = "";
let selectedManageSlot = "";
let managedReservation = null;
let realtimeRefreshTimer = null;
let pollingRefreshTimer = null;
let pollingRefreshInProgress = false;

const els = {
  tabs: document.querySelectorAll(".tab"),
  clientView: document.querySelector("#clientView"),
  manageView: document.querySelector("#manageView"),
  adminView: document.querySelector("#adminView"),
  serviceSelect: document.querySelector("#serviceSelect"),
  dateInput: document.querySelector("#dateInput"),
  slotsGrid: document.querySelector("#slotsGrid"),
  bookingForm: document.querySelector("#bookingForm"),
  clientName: document.querySelector("#clientName"),
  clientEmail: document.querySelector("#clientEmail"),
  clientPhone: document.querySelector("#clientPhone"),
  rememberClientData: document.querySelector("#rememberClientData"),
  clientNote: document.querySelector("#clientNote"),
  bookingMessage: document.querySelector("#bookingMessage"),
  manageReservationSummary: document.querySelector("#manageReservationSummary"),
  manageServiceSelect: document.querySelector("#manageServiceSelect"),
  manageDateInput: document.querySelector("#manageDateInput"),
  manageSlotsGrid: document.querySelector("#manageSlotsGrid"),
  manageChangePreview: document.querySelector("#manageChangePreview"),
  locationBox: document.querySelector("#locationBox"),
  bookingSummary: document.querySelector("#bookingSummary"),
  confirmationBox: document.querySelector("#confirmationBox"),
  rescheduleButton: document.querySelector("#rescheduleButton"),
  cancelManageButton: document.querySelector("#cancelManageButton"),
  manageMessage: document.querySelector("#manageMessage"),
  manageNotice: document.querySelector("#manageNotice"),
  loginPanel: document.querySelector("#loginPanel"),
  resetPanel: document.querySelector("#resetPanel"),
  adminPanel: document.querySelector("#adminPanel"),
  adminEmail: document.querySelector("#adminEmail"),
  adminPin: document.querySelector("#adminPin"),
  loginButton: document.querySelector("#loginButton"),
  resetPasswordInput: document.querySelector("#resetPasswordInput"),
  resetPasswordButton: document.querySelector("#resetPasswordButton"),
  resetMessage: document.querySelector("#resetMessage"),
  hoursEditor: document.querySelector("#hoursEditor"),
  maxDaysInput: document.querySelector("#maxDaysInput"),
  slotStepInput: document.querySelector("#slotStepInput"),
  saveConfigButton: document.querySelector("#saveConfigButton"),
  configMessage: document.querySelector("#configMessage"),
  servicesEditor: document.querySelector("#servicesEditor"),
  addServiceButton: document.querySelector("#addServiceButton"),
  notificationEmailInput: document.querySelector("#notificationEmailInput"),
  businessAddressInput: document.querySelector("#businessAddressInput"),
  mapsUrlInput: document.querySelector("#mapsUrlInput"),
  savePolicyButton: document.querySelector("#savePolicyButton"),
  policyMessage: document.querySelector("#policyMessage"),
  adminMonthInput: document.querySelector("#adminMonthInput"),
  prevMonthButton: document.querySelector("#prevMonthButton"),
  currentMonthButton: document.querySelector("#currentMonthButton"),
  nextMonthButton: document.querySelector("#nextMonthButton"),
  monthPlanner: document.querySelector("#monthPlanner"),
  savePlannerButton: document.querySelector("#savePlannerButton"),
  plannerMessage: document.querySelector("#plannerMessage"),
  adminDateFilter: document.querySelector("#adminDateFilter"),
  reservationsList: document.querySelector("#reservationsList"),
  blockTimeInput: document.querySelector("#blockTimeInput"),
  blockDurationInput: document.querySelector("#blockDurationInput"),
  blockNoteInput: document.querySelector("#blockNoteInput"),
  blockSlotButton: document.querySelector("#blockSlotButton"),
  blockMessage: document.querySelector("#blockMessage"),
  blockedSlotsList: document.querySelector("#blockedSlotsList"),
  newPinInput: document.querySelector("#newPinInput"),
  savePinButton: document.querySelector("#savePinButton"),
  pinMessage: document.querySelector("#pinMessage")
};

init().catch((error) => {
  console.error(error);
  onlineUnavailable = onlineRequired;
  state = onlineUnavailable ? structuredClone(defaultState) : loadLocalState();
  renderApp();
  if (onlineUnavailable) {
    setOnlineUnavailableState();
  } else {
    setMessage(els.bookingMessage, "No se pudo conectar online. La demo sigue en modo local.", "error");
  }
});

async function init() {
  document.body.classList.toggle("admin-page", adminMode);
  document.body.classList.toggle("manage-page", Boolean(manageToken));

  if (!localStorage.getItem(ADMIN_KEY)) {
    localStorage.setItem(ADMIN_KEY, "1234");
  }

  state = await loadState();
  await configureAccess();
  bindEvents();
  loadRememberedClientData();
  setupRealtimeAgenda();
  setupAutoRefresh();
  if (manageToken) {
    await loadManagedReservation();
  }
  renderApp();
}

async function configureAccess() {
  const adminTab = document.querySelector('[data-view="admin"]');

  if (manageToken) {
    adminTab.classList.add("hidden");
    document.querySelector(".tabs").classList.add("hidden");
    switchView("manage");
    return;
  }

  if (!adminMode) {
    adminTab.classList.add("hidden");
    document.querySelector(".tabs").classList.add("hidden");
    switchView("client");
    return;
  }

  switchView("admin");
  await restoreAdminSession();
}

async function restoreAdminSession() {
  if (!supabaseClient || recoveryMode) return;

  const { data, error } = await supabaseClient.auth.getSession();
  if (error || !data.session) return;

  els.loginPanel.classList.add("hidden");
  els.adminPanel.classList.remove("hidden");
}

function bindEvents() {
  els.tabs.forEach((tab) => {
    tab.addEventListener("click", () => switchView(tab.dataset.view));
  });

  els.serviceSelect.addEventListener("change", async () => {
    selectedSlot = "";
    hideConfirmation();
    await refreshReservationsForCurrentRange();
    renderSlots();
    updateBookingSummary();
  });

  els.dateInput.addEventListener("change", async () => {
    selectedSlot = "";
    hideConfirmation();
    await refreshReservationsForCurrentRange();
    renderSlots();
    updateBookingSummary();
  });

  els.bookingForm.addEventListener("submit", createReservation);
  els.manageServiceSelect.addEventListener("change", async () => {
    selectedManageSlot = "";
    await refreshReservationsForDate(els.manageDateInput.value);
    renderManageSlots();
  });
  els.manageDateInput.addEventListener("change", async () => {
    selectedManageSlot = "";
    await refreshReservationsForDate(els.manageDateInput.value);
    renderManageSlots();
  });
  els.rescheduleButton.addEventListener("click", rescheduleManagedReservation);
  els.cancelManageButton.addEventListener("click", cancelManagedReservation);
  els.loginButton.addEventListener("click", loginAdmin);
  els.resetPasswordButton.addEventListener("click", saveRecoveryPassword);
  els.saveConfigButton.addEventListener("click", saveConfig);
  els.addServiceButton.addEventListener("click", addService);
  els.savePolicyButton.addEventListener("click", savePolicy);
  els.adminMonthInput.addEventListener("change", renderMonthPlanner);
  els.prevMonthButton.addEventListener("click", () => shiftPlannerMonth(-1));
  els.currentMonthButton.addEventListener("click", () => setPlannerMonth(toMonthInput(new Date())));
  els.nextMonthButton.addEventListener("click", () => shiftPlannerMonth(1));
  els.savePlannerButton.addEventListener("click", saveMonthlyPlanner);
  els.adminDateFilter.addEventListener("change", async () => {
    await refreshReservationsForCurrentRange();
    renderReservations();
    renderBlockedSlots();
  });
  els.blockSlotButton.addEventListener("click", blockSlot);
  els.savePinButton.addEventListener("click", savePassword);
}

function setupRealtimeAgenda() {
  if (!supabaseClient) return;

  supabaseClient
    .channel("public-agenda-changes")
    .on("postgres_changes", { event: "*", schema: "public", table: "reservations" }, scheduleRealtimeRefresh)
    .on("postgres_changes", { event: "*", schema: "public", table: "blocked_slots" }, scheduleRealtimeRefresh)
    .on("postgres_changes", { event: "*", schema: "public", table: "availability_overrides" }, scheduleRealtimeReload)
    .on("postgres_changes", { event: "*", schema: "public", table: "opening_hours" }, scheduleRealtimeReload)
    .on("postgres_changes", { event: "*", schema: "public", table: "services" }, scheduleRealtimeReload)
    .on("postgres_changes", { event: "*", schema: "public", table: "app_settings" }, scheduleRealtimeReload)
    .subscribe();
}

function setupAutoRefresh() {
  if (!supabaseClient) return;

  window.clearInterval(pollingRefreshTimer);
  pollingRefreshTimer = window.setInterval(() => {
    if (document.hidden) return;
    refreshVisibleAgenda();
  }, AGENDA_REFRESH_MS);

  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) refreshVisibleAgenda();
  });
}

function scheduleRealtimeRefresh() {
  window.clearTimeout(realtimeRefreshTimer);
  realtimeRefreshTimer = window.setTimeout(refreshVisibleAgenda, 350);
}

function scheduleRealtimeReload() {
  window.clearTimeout(realtimeRefreshTimer);
  realtimeRefreshTimer = window.setTimeout(reloadVisibleAgenda, 350);
}

async function refreshVisibleAgenda() {
  if (pollingRefreshInProgress) return;
  pollingRefreshInProgress = true;

  try {
    await refreshReservationsForCurrentRange();
    renderSlots();
    renderReservations();
    renderBlockedSlots();
    if (managedReservation) renderManageSlots();
  } catch (error) {
    console.warn("No se pudo actualizar la agenda en vivo", error);
  } finally {
    pollingRefreshInProgress = false;
  }
}

async function reloadVisibleAgenda() {
  try {
    state = await loadState();
    renderApp();
  } catch (error) {
    console.warn("No se pudo recargar la agenda en vivo", error);
  }
}

function renderApp() {
  setDateLimits();
  renderServices();
  renderLocation();
  renderManageServices();
  renderSlots();
  updateBookingSummary();
  renderAdmin();
  renderManagedReservation();
  if (onlineUnavailable) setOnlineUnavailableState();
  renderRecoveryPanel();
}

async function renderRecoveryPanel() {
  if (!recoveryMode) return;

  els.loginPanel.classList.add("hidden");
  els.adminPanel.classList.add("hidden");
  els.resetPanel.classList.remove("hidden");

  if (!supabaseClient) {
    setMessage(els.resetMessage, "No se pudo conectar con Supabase para cambiar la contraseña.", "error");
    els.resetPasswordButton.disabled = true;
    return;
  }

  const { data } = await supabaseClient.auth.getSession();
  if (!data.session) {
    setMessage(els.resetMessage, "El link no abrió una sesión válida. Pedí otro mail de recuperación.", "error");
    els.resetPasswordButton.disabled = true;
  }
}

async function loadState() {
  if (!supabaseClient) return loadLocalState();

  const { data: sessionData } = await supabaseClient.auth.getSession();
  const isAdminAuthenticated = Boolean(sessionData.session);
  const reservationsQuery = adminMode && isAdminAuthenticated
    ? supabaseClient.from("reservations").select("*").neq("status", "cancelled")
    : supabaseClient.from("reservation_slots").select("*");

  const [settingsResult, hoursResult, servicesResult, overridesResult, blockedSlotsResult, slotsResult] = await Promise.all([
    supabaseClient.from("app_settings").select("*").eq("id", true).maybeSingle(),
    supabaseClient.from("opening_hours").select("*").order("weekday"),
    supabaseClient.from("services").select("*").eq("active", true).order("sort_order"),
    supabaseClient.from("availability_overrides").select("*"),
    supabaseClient.from("blocked_slots").select("*").order("date").order("time"),
    reservationsQuery
  ]);

  throwIfSupabaseError(settingsResult.error);
  throwIfSupabaseError(hoursResult.error);
  throwIfSupabaseError(servicesResult.error);
  if (overridesResult.error) {
    console.warn("No se pudo cargar la planificación mensual", overridesResult.error);
  }
  if (blockedSlotsResult.error) {
    console.warn("No se pudieron cargar los horarios bloqueados", blockedSlotsResult.error);
  }
  throwIfSupabaseError(slotsResult.error);

  return {
    ...structuredClone(defaultState),
    config: {
      ...structuredClone(defaultState.config),
      maxDaysAhead: settingsResult.data?.max_days_ahead ?? defaultState.config.maxDaysAhead,
      slotStep: settingsResult.data?.slot_step ?? defaultState.config.slotStep,
      notificationEmail: settingsResult.data?.notification_email ?? "",
      businessAddress: settingsResult.data?.business_address ?? "",
      mapsUrl: settingsResult.data?.maps_url ?? "",
      hours: normalizeOpeningHours(mapOpeningHoursFromDb(hoursResult.data || []))
    },
    availabilityOverrides: mapAvailabilityOverridesFromDb(overridesResult.error ? [] : overridesResult.data || []),
    blockedSlots: (blockedSlotsResult.error ? [] : blockedSlotsResult.data || []).map(mapBlockedSlotFromDb),
    services: normalizeServices((servicesResult.data || []).map(mapServiceFromDb)),
    reservations: (slotsResult.data || []).map(mapReservationSlotFromDb)
  };
}

function loadLocalState() {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return structuredClone(defaultState);

  try {
    const parsed = JSON.parse(stored);
    const merged = {
      ...structuredClone(defaultState),
      ...parsed,
      config: {
        ...structuredClone(defaultState.config),
        ...parsed.config,
        hours: { ...structuredClone(defaultState.config.hours), ...parsed.config?.hours }
      },
      availabilityOverrides: parsed.availabilityOverrides || {},
      blockedSlots: parsed.blockedSlots || []
    };
    return migrateState(merged);
  } catch {
    return structuredClone(defaultState);
  }
}

function migrateState(currentState) {
  if (Number(currentState.settingsVersion || 0) >= SETTINGS_VERSION) return currentState;

  currentState.config.notificationEmail = currentState.config.notificationEmail || "";
  currentState.config.businessAddress = currentState.config.businessAddress || "";
  currentState.config.mapsUrl = currentState.config.mapsUrl || "";
  currentState.blockedSlots = currentState.blockedSlots || [];
  currentState.services = currentState.services.map((service) => {
    if (service.name.toLowerCase() === "corte") {
      return { ...service, duration: 30 };
    }
    return service;
  });
  currentState.settingsVersion = SETTINGS_VERSION;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(currentState));
  return currentState;
}

function saveLocalState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function switchView(view) {
  els.tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.view === view));
  els.clientView.classList.toggle("active", view === "client");
  els.manageView.classList.toggle("active", view === "manage");
  els.adminView.classList.toggle("active", view === "admin");
}

function setDateLimits() {
  const today = toDateInput(new Date());
  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + Number(state.config.maxDaysAhead || 21));
  const maxConfiguredDate = toDateInput(maxDate);
  const enabledOverrideDates = Object.entries(state.availabilityOverrides || {})
    .filter(([date, rules]) => date >= today && rules?.open)
    .map(([date]) => date);
  const maxEnabledDate = enabledOverrideDates.length ? enabledOverrideDates.sort().at(-1) : "";

  els.dateInput.min = today;
  els.dateInput.max = maxEnabledDate && maxEnabledDate > maxConfiguredDate ? maxEnabledDate : maxConfiguredDate;
  if (!els.dateInput.value) els.dateInput.value = today;
  els.manageDateInput.min = today;
  els.manageDateInput.max = els.dateInput.max;
}

function renderServices() {
  els.serviceSelect.innerHTML = state.services
    .map((service) => `<option value="${service.id}">${escapeHtml(formatServiceLabel(service))}</option>`)
    .join("");
}

function renderManageServices() {
  els.manageServiceSelect.innerHTML = state.services
    .map((service) => `<option value="${service.id}">${escapeHtml(formatServiceLabel(service))}</option>`)
    .join("");
}

function renderLocation() {
  const address = state.config.businessAddress?.trim();
  const mapsUrl = normalizeMapsUrl(state.config.mapsUrl, address);

  if (!address && !mapsUrl) {
    els.locationBox.classList.add("hidden");
    els.locationBox.innerHTML = "";
    return;
  }

  els.locationBox.classList.remove("hidden");
  els.locationBox.innerHTML = `
    <div class="panel-heading">
      <p class="section-label">Ubicación</p>
      <h3>Cómo llegar</h3>
    </div>
    <div class="location-content">
      ${address ? `<span>${escapeHtml(address)}</span>` : ""}
      ${mapsUrl ? `<a href="${escapeHtml(mapsUrl)}" target="_blank" rel="noopener">Abrir mapa</a>` : ""}
    </div>
  `;
}

function renderSlots() {
  if (onlineUnavailable) {
    els.slotsGrid.innerHTML = `<p class="empty-state">Agenda online no disponible.</p>`;
    return;
  }

  const service = getSelectedService();
  const date = els.dateInput.value;
  if (!service || !date) {
    els.slotsGrid.innerHTML = `<p class="empty-state">Elegí servicio y fecha para ver horarios.</p>`;
    return;
  }

  const slots = getAvailableSlots(date, service.duration);
  if (!slots.length) {
    els.slotsGrid.innerHTML = `<p class="empty-state">${escapeHtml(getNoSlotsMessage(date))}</p>`;
    updateBookingSummary();
    return;
  }

  els.slotsGrid.innerHTML = slots
    .map((slot) => {
      const active = slot === selectedSlot ? " active" : "";
      return `<button class="slot-button${active}" type="button" data-slot="${slot}">${slot}</button>`;
    })
    .join("");

  els.slotsGrid.querySelectorAll(".slot-button").forEach((button) => {
    button.addEventListener("click", () => {
      selectedSlot = button.dataset.slot;
      hideConfirmation();
      renderSlots();
      updateBookingSummary();
      clearMessage(els.bookingMessage);
    });
  });
  updateBookingSummary();
}

function getAvailableSlots(date, duration, ignoredReservationId = "") {
  const rules = getScheduleForDate(date);
  if (!rules || !rules.open) return [];

  const start = toMinutes(rules.start);
  const end = toMinutes(rules.end);
  const step = Number(state.config.slotStep || 30);
  const booked = state.reservations.filter(
    (item) => item.date === date && item.status !== "cancelled" && item.id !== ignoredReservationId
  );
  const blocked = state.blockedSlots.filter((item) => item.date === date);
  const slots = [];

  for (let minute = start; minute + duration <= end; minute += step) {
    const slotEnd = minute + duration;
    const crossesBreak =
      rules.breakStart &&
      rules.breakEnd &&
      rangesOverlap(minute, slotEnd, toMinutes(rules.breakStart), toMinutes(rules.breakEnd));
    const overlapsBooking = booked.some((item) =>
      rangesOverlap(minute, slotEnd, toMinutes(item.time), toMinutes(item.time) + Number(item.duration))
    );
    const overlapsBlock = blocked.some((item) =>
      rangesOverlap(minute, slotEnd, toMinutes(item.time), toMinutes(item.time) + Number(item.duration))
    );

    if (!crossesBreak && !overlapsBooking && !overlapsBlock && !isPastSlot(date, minute)) {
      slots.push(fromMinutes(minute));
    }
  }

  return slots;
}

function updateBookingSummary() {
  const service = getSelectedService();
  const date = els.dateInput.value;

  if (!service || !date || !selectedSlot) {
    els.bookingSummary.innerHTML = `
      <strong>Resumen del turno</strong>
      <span>Elegí un horario para revisar la reserva antes de confirmarla.</span>
    `;
    return;
  }

  els.bookingSummary.innerHTML = `
    <strong>Resumen del turno</strong>
    <span>${escapeHtml(service.name)} · ${formatDate(date)} · ${selectedSlot}</span>
    <span>${service.duration} min${service.price ? ` · $${Number(service.price).toLocaleString("es-AR")}` : ""}</span>
  `;
}

async function createReservation(event) {
  event.preventDefault();

  if (onlineUnavailable) {
    setMessage(els.bookingMessage, "La agenda online no está disponible. Probá más tarde.", "error");
    return;
  }

  const service = getSelectedService();

  if (!service || !selectedSlot) {
    setMessage(els.bookingMessage, "Elegí un horario disponible.", "error");
    return;
  }

  if (!els.clientPhone.value.trim()) {
    setMessage(els.bookingMessage, "Dejá un teléfono para que la barbería pueda contactarte.", "error");
    els.clientPhone.focus();
    return;
  }

  await refreshReservationsForCurrentRange();
  const stillAvailable = getAvailableSlots(els.dateInput.value, service.duration).includes(selectedSlot);
  if (!stillAvailable) {
    selectedSlot = "";
    renderSlots();
    setMessage(els.bookingMessage, "Ese horario acaba de quedar ocupado. Elegí otro.", "error");
    return;
  }

  const reservation = {
    id: createId(),
    serviceId: service.id,
    serviceName: service.name,
    duration: service.duration,
    price: service.price,
    date: els.dateInput.value,
    time: selectedSlot,
    name: els.clientName.value.trim(),
    email: els.clientEmail.value.trim(),
    phone: els.clientPhone.value.trim(),
    note: els.clientNote.value.trim(),
    status: "confirmed",
    createdAt: new Date().toISOString()
  };

  if (els.rememberClientData.checked) {
    localStorage.setItem(CLIENT_DATA_KEY, JSON.stringify({
      name: reservation.name,
      email: reservation.email,
      phone: reservation.phone
    }));
  } else {
    localStorage.removeItem(CLIENT_DATA_KEY);
  }

  els.bookingForm.querySelector("button[type='submit']").disabled = true;

  try {
    const saved = await saveReservation(reservation);
    state.reservations.push(saved);
    sortReservations();
    if (!supabaseClient) saveLocalState();
    const emailCopy = state.config.notificationEmail ? " Te enviamos la confirmación por mail." : "";
    setMessage(
      els.bookingMessage,
      "Turno confirmado.",
      "success"
    );
    renderConfirmation(saved, emailCopy);
    els.clientName.value = "";
    els.clientEmail.value = "";
    els.clientPhone.value = "";
    els.clientNote.value = "";
    selectedSlot = "";
    renderSlots();
    renderReservations();
  } catch (error) {
    console.error(error);
    await refreshReservationsForCurrentRange();
    renderSlots();
    setMessage(els.bookingMessage, "No se pudo confirmar el turno. Probá con otro horario.", "error");
  } finally {
    els.bookingForm.querySelector("button[type='submit']").disabled = false;
  }
}

function loadRememberedClientData() {
  try {
    const saved = JSON.parse(localStorage.getItem(CLIENT_DATA_KEY) || "null");
    if (!saved) return;

    els.clientName.value = saved.name || "";
    els.clientEmail.value = saved.email || "";
    els.clientPhone.value = saved.phone || "";
    els.rememberClientData.checked = true;
  } catch {
    localStorage.removeItem(CLIENT_DATA_KEY);
  }
}

async function loadManagedReservation() {
  if (!supabaseClient || !manageToken) {
    return;
  }

  const { data, error } = await supabaseClient.rpc("get_reservation_by_token", {
    p_manage_token: manageToken
  });

  if (error || !data) {
    console.error(error);
    managedReservation = null;
    return;
  }

  managedReservation = mapReservationFromDb(data);
  renderManageServices();
  if (managedReservation.serviceId) {
    els.manageServiceSelect.value = managedReservation.serviceId;
  }
  els.manageDateInput.value = managedReservation.date;
  await refreshReservationsForDate(managedReservation.date);
}

function renderManagedReservation() {
  if (!manageToken) return;

  if (!supabaseClient) {
    els.manageReservationSummary.innerHTML = `<strong>No disponible</strong><span>La gestión online necesita conexión con Supabase.</span>`;
    els.manageNotice.innerHTML = `<span>Probá nuevamente cuando el sitio esté publicado.</span>`;
    els.rescheduleButton.disabled = true;
    els.cancelManageButton.disabled = true;
    return;
  }

  if (!managedReservation) {
    els.manageReservationSummary.innerHTML = `<strong>Reserva no encontrada</strong><span>El link puede estar vencido o la reserva ya fue cancelada.</span>`;
    els.manageNotice.innerHTML = `<span>Si necesitás ayuda, contactá a la barbería.</span>`;
    els.rescheduleButton.disabled = true;
    els.cancelManageButton.disabled = true;
    return;
  }

  els.manageReservationSummary.innerHTML = `
    <strong>Turno actual</strong>
    <span>${escapeHtml(managedReservation.serviceName)} · ${formatDate(managedReservation.date)} · ${managedReservation.time}</span>
    <span>${escapeHtml(managedReservation.name)} · ${escapeHtml(managedReservation.email)}</span>
    <a class="secondary-link" href="${escapeHtml(buildCalendarUrl(managedReservation))}" target="_blank" rel="noopener">Agregar a Google Calendar</a>
  `;
  els.manageNotice.innerHTML = `
    <strong>Para modificar</strong>
    <span>Elegí fecha y horario nuevo, revisá la selección y confirmá el cambio.</span>
    <strong>Para cancelar</strong>
    <span>Usá el botón Cancelar turno. El horario queda disponible automáticamente.</span>
  `;
  renderManageSlots();
}

function renderConfirmation(reservation, emailCopy = "") {
  const calendarUrl = buildCalendarUrl(reservation);
  els.confirmationBox.classList.remove("hidden");
  els.confirmationBox.innerHTML = `
    <strong>Turno confirmado</strong>
    <span>${escapeHtml(reservation.serviceName)} · ${formatDate(reservation.date)} · ${reservation.time}</span>
    <span>${escapeHtml(reservation.name)}${emailCopy}</span>
    <a class="secondary-link" href="${escapeHtml(calendarUrl)}" target="_blank" rel="noopener">Agregar a Google Calendar</a>
  `;
}

function renderManageSlots() {
  if (!managedReservation) {
    els.manageSlotsGrid.innerHTML = `<p class="empty-state">No hay reserva cargada.</p>`;
    updateManageChangePreview();
    return;
  }

  const service = getSelectedManageService();
  const date = els.manageDateInput.value;
  if (!service || !date) {
    els.manageSlotsGrid.innerHTML = `<p class="empty-state">Elegí servicio y fecha para ver horarios.</p>`;
    updateManageChangePreview();
    return;
  }

  const slots = getAvailableSlots(date, service.duration, managedReservation.id);
  if (selectedManageSlot && !slots.includes(selectedManageSlot)) {
    selectedManageSlot = "";
  }

  if (!slots.length) {
    els.manageSlotsGrid.innerHTML = `<p class="empty-state">${escapeHtml(getNoSlotsMessage(date))}</p>`;
    updateManageChangePreview();
    return;
  }

  els.manageSlotsGrid.innerHTML = slots
    .map((slot) => {
      const active = slot === selectedManageSlot ? " active" : "";
      const current = service.id === managedReservation.serviceId && date === managedReservation.date && slot === managedReservation.time;
      const currentClass = current ? " current" : "";
      const label = current ? `${slot} · actual` : slot;
      return `<button class="slot-button${active}${currentClass}" type="button" data-slot="${slot}">${label}</button>`;
    })
    .join("");

  els.manageSlotsGrid.querySelectorAll(".slot-button").forEach((button) => {
    button.addEventListener("click", () => {
      selectedManageSlot = button.dataset.slot;
      renderManageSlots();
      clearMessage(els.manageMessage);
    });
  });
  updateManageChangePreview();
}

function updateManageChangePreview() {
  if (!managedReservation || !els.manageChangePreview) return;

  const service = getSelectedManageService();
  const date = els.manageDateInput.value;
  const hasSelection = Boolean(service && date && selectedManageSlot);
  els.rescheduleButton.disabled = !hasSelection;

  if (!hasSelection) {
    els.manageChangePreview.innerHTML = `
      <strong>Nuevo turno</strong>
      <span>Elegí un horario disponible para confirmar el cambio.</span>
    `;
    return;
  }

  const isSameSlot =
    service.id === managedReservation.serviceId &&
    date === managedReservation.date &&
    selectedManageSlot === managedReservation.time;

  els.manageChangePreview.innerHTML = `
    <strong>${isSameSlot ? "Seleccionaste el turno actual" : "Nuevo turno seleccionado"}</strong>
    <span>${escapeHtml(service.name)} · ${formatDate(date)} · ${selectedManageSlot}</span>
  `;
}

async function cancelManagedReservation() {
  if (!managedReservation || !manageToken) return;
  if (!window.confirm("¿Querés cancelar este turno?")) return;

  els.cancelManageButton.disabled = true;

  try {
    const { data, error } = await supabaseClient.rpc("cancel_reservation_by_token", {
      p_manage_token: manageToken
    });
    throwIfSupabaseError(error);

    const cancelled = mapReservationFromDb(data);
    sendReservationEmails(cancelled, "cancelled").catch((error) => {
      console.warn("Turno cancelado, pero falló el mail de cancelación", error);
    });
    managedReservation = null;
    await refreshReservationsForDate(cancelled.date);
    renderManagedReservation();
    setMessage(els.manageMessage, "Turno cancelado. El horario quedó disponible.", "success");
  } catch (error) {
    console.error(error);
    const detail = error?.message ? ` ${error.message}` : "";
    setMessage(els.manageMessage, `No se pudo cancelar el turno.${detail}`, "error");
  } finally {
    if (managedReservation) {
      els.cancelManageButton.disabled = false;
    }
  }
}

async function rescheduleManagedReservation() {
  if (!managedReservation || !manageToken) return;

  const service = getSelectedManageService();
  const previousDate = managedReservation.date;
  if (!service || !selectedManageSlot) {
    setMessage(els.manageMessage, "Elegí un nuevo horario disponible.", "error");
    return;
  }

  const stillAvailable = getAvailableSlots(els.manageDateInput.value, service.duration, managedReservation.id).includes(selectedManageSlot);
  if (!stillAvailable) {
    selectedManageSlot = "";
    await refreshReservationsForDate(els.manageDateInput.value);
    renderManageSlots();
    setMessage(els.manageMessage, "Ese horario acaba de quedar ocupado. Elegí otro.", "error");
    return;
  }

  els.rescheduleButton.disabled = true;

  try {
    const { data, error } = await supabaseClient.rpc("reschedule_reservation_by_token", {
      p_manage_token: manageToken,
      p_service_id: service.id,
      p_service_name: service.name,
      p_duration: service.duration,
      p_price: service.price,
      p_date: els.manageDateInput.value,
      p_time: selectedManageSlot
    });
    throwIfSupabaseError(error);

    managedReservation = mapReservationFromDb(data);
    selectedManageSlot = "";
    await refreshReservationsForDate(previousDate);
    await refreshReservationsForDate(managedReservation.date);
    renderManagedReservation();
    sendReservationEmails(managedReservation, "updated").catch((error) => {
      console.warn("Turno modificado, pero falló el mail de modificación", error);
    });
    setMessage(els.manageMessage, "Turno modificado. El horario anterior quedó disponible.", "success");
  } catch (error) {
    console.error(error);
    await refreshReservationsForDate(els.manageDateInput.value);
    renderManageSlots();
    const detail = error?.message ? ` ${error.message}` : "";
    setMessage(els.manageMessage, `No se pudo modificar el turno.${detail}`, "error");
  } finally {
    updateManageChangePreview();
  }
}

async function saveReservation(reservation) {
  if (!supabaseClient) {
    return reservation;
  }

  const { data, error } = await supabaseClient.rpc("create_reservation", {
    p_service_id: reservation.serviceId,
    p_service_name: reservation.serviceName,
    p_duration: reservation.duration,
    p_price: reservation.price,
    p_date: reservation.date,
    p_time: reservation.time,
    p_name: reservation.name,
    p_email: reservation.email,
    p_phone: reservation.phone,
    p_note: reservation.note
  });

  throwIfSupabaseError(error);
  const saved = mapReservationFromDb(data);

  if (state.config.notificationEmail) {
    await sendReservationEmails(saved, "confirmed");
  }

  return saved;
}

async function sendReservationEmails(reservation, action = "confirmed") {
  if (!supabaseClient || !state.config.notificationEmail) return;

  try {
    const { error } = await supabaseClient.functions.invoke("send-reservation-email", {
      body: {
        barberEmail: state.config.notificationEmail,
        reservation: {
          service_name: reservation.serviceName,
          date: reservation.date,
          time: reservation.time,
          duration: reservation.duration,
          name: reservation.name,
          email: reservation.email,
          phone: reservation.phone,
          note: reservation.note,
          manage_token: reservation.manageToken
        },
        action,
        manageUrl: reservation.manageToken ? `${window.location.origin}${window.location.pathname}?reserva=${reservation.manageToken}` : "",
        calendarUrl: buildCalendarUrl(reservation)
      }
    });

    if (error) {
      console.warn("Reserva creada, pero falló el envío de email", error);
    }
  } catch (error) {
    console.warn("Reserva creada, pero no se pudo contactar la función de email", error);
  }
}

function renderAdmin() {
  els.maxDaysInput.value = state.config.maxDaysAhead;
  els.slotStepInput.value = state.config.slotStep;
  els.notificationEmailInput.value = state.config.notificationEmail || "";
  els.businessAddressInput.value = state.config.businessAddress || "";
  els.mapsUrlInput.value = state.config.mapsUrl || "";
  renderHoursEditor();
  renderServicesEditor();
  if (!els.adminMonthInput.value) {
    els.adminMonthInput.value = toMonthInput(new Date());
  }
  renderMonthPlanner();
  if (!els.adminDateFilter.value) {
    els.adminDateFilter.value = els.dateInput.value || toDateInput(new Date());
  }
  renderReservations();
  renderBlockedSlots();
}

async function loginAdmin() {
  if (supabaseClient) {
    const email = els.adminEmail.value.trim();
    const password = els.adminPin.value.trim();
    const { error } = await supabaseClient.auth.signInWithPassword({ email, password });

    if (error) {
      els.adminPin.value = "";
      els.adminPin.placeholder = "Acceso incorrecto";
      return;
    }

    state = await loadState();
    els.loginPanel.classList.add("hidden");
    els.adminPanel.classList.remove("hidden");
    els.adminEmail.value = "";
    els.adminPin.value = "";
    renderAdmin();
    return;
  }

  if (els.adminPin.value === localStorage.getItem(ADMIN_KEY)) {
    els.loginPanel.classList.add("hidden");
    els.adminPanel.classList.remove("hidden");
    els.adminPin.value = "";
    renderAdmin();
    return;
  }

  els.adminPin.value = "";
  els.adminPin.placeholder = "PIN incorrecto";
}

function renderHoursEditor() {
  els.hoursEditor.innerHTML = dayNames
    .map((name, index) => {
      const item = state.config.hours[index];
      return `
        <div class="hours-row" data-day="${index}">
          <label class="checkbox-label">
            <input type="checkbox" data-field="open" ${item.open ? "checked" : ""} />
            ${name}
          </label>
          <label>Abre<input type="time" data-field="start" value="${item.start}" /></label>
          <label>Cierra<input type="time" data-field="end" value="${item.end}" /></label>
          <label>Descanso<input type="time" data-field="breakStart" value="${item.breakStart}" /></label>
          <label>Fin descanso<input type="time" data-field="breakEnd" value="${item.breakEnd}" /></label>
        </div>
      `;
    })
    .join("");
}

function renderMonthPlanner() {
  const month = els.adminMonthInput.value || toMonthInput(new Date());
  const dates = getMonthDates(month);
  els.prevMonthButton.disabled = month <= toMonthInput(new Date());

  els.monthPlanner.innerHTML = dates
    .map((date) => {
      const rules = getScheduleForDate(date);
      return `
        <div class="planner-row" data-date="${date}">
          <div>
            <strong>${formatDate(date)}</strong>
            <span>${date}</span>
          </div>
          <label class="checkbox-label compact-check">
            <input type="checkbox" data-field="open" ${rules.open ? "checked" : ""} />
          </label>
          <input type="time" data-field="start" value="${rules.start}" />
          <input type="time" data-field="end" value="${rules.end}" />
          <input type="time" data-field="breakStart" value="${rules.breakStart}" />
          <input type="time" data-field="breakEnd" value="${rules.breakEnd}" />
        </div>
      `;
    })
    .join("");
}

function shiftPlannerMonth(offset) {
  const baseMonth = els.adminMonthInput.value || toMonthInput(new Date());
  const [year, month] = baseMonth.split("-").map(Number);
  const next = new Date(year, month - 1 + offset, 1, 12);
  setPlannerMonth(toMonthInput(next));
}

function setPlannerMonth(month) {
  els.adminMonthInput.value = month;
  renderMonthPlanner();
  clearMessage(els.plannerMessage);
}

async function saveConfig() {
  const nextHours = {};
  els.hoursEditor.querySelectorAll(".hours-row").forEach((row) => {
    const day = row.dataset.day;
    nextHours[day] = {};
    row.querySelectorAll("[data-field]").forEach((input) => {
      nextHours[day][input.dataset.field] = input.type === "checkbox" ? input.checked : input.value;
    });
  });

  state.config.hours = nextHours;
  state.config.maxDaysAhead = clamp(Number(els.maxDaysInput.value), 1, 90);
  state.config.slotStep = Number(els.slotStepInput.value);

  try {
    await persistConfig();
    const plannerUpdates = buildMonthlyPlanFromBaseHours();
    state.availabilityOverrides = {
      ...state.availabilityOverrides,
      ...plannerUpdates
    };
    await persistAvailabilityOverrides(plannerUpdates);
    setDateLimits();
    selectedSlot = "";
    await refreshReservationsForCurrentRange();
    renderMonthPlanner();
    renderSlots();
    renderReservations();
    setMessage(els.configMessage, "Horarios base guardados y aplicados a la planificación visible.", "success");
  } catch (error) {
    console.error(error);
    setMessage(els.configMessage, "No se pudieron guardar los horarios.", "error");
  }
}

function buildMonthlyPlanFromBaseHours() {
  const month = els.adminMonthInput.value || toMonthInput(new Date());
  return getMonthDates(month).reduce((updates, date) => {
    const weekday = new Date(`${date}T12:00:00`).getDay();
    updates[date] = { ...state.config.hours[weekday] };
    return updates;
  }, {});
}

async function saveMonthlyPlanner() {
  const updates = {};

  els.monthPlanner.querySelectorAll(".planner-row").forEach((row) => {
    const date = row.dataset.date;
    updates[date] = {
      open: row.querySelector('[data-field="open"]').checked,
      start: row.querySelector('[data-field="start"]').value || "13:00",
      end: row.querySelector('[data-field="end"]').value || "21:00",
      breakStart: row.querySelector('[data-field="breakStart"]').value,
      breakEnd: row.querySelector('[data-field="breakEnd"]').value
    };
  });

  state.availabilityOverrides = {
    ...state.availabilityOverrides,
    ...updates
  };

  try {
    await persistAvailabilityOverrides(updates);
    selectedSlot = "";
    await refreshReservationsForCurrentRange();
    renderSlots();
    renderReservations();
    setMessage(els.plannerMessage, "Planificación guardada.", "success");
  } catch (error) {
    console.error(error);
    setMessage(els.plannerMessage, "No se pudo guardar la planificación.", "error");
  }
}

async function persistConfig() {
  if (!supabaseClient) {
    saveLocalState();
    return;
  }

  const settings = {
    id: true,
    notification_email: state.config.notificationEmail,
    business_address: state.config.businessAddress,
    maps_url: state.config.mapsUrl,
    max_days_ahead: state.config.maxDaysAhead,
    slot_step: state.config.slotStep,
    updated_at: new Date().toISOString()
  };
  const hours = Object.entries(state.config.hours).map(([weekday, item]) => ({
    weekday: Number(weekday),
    open: Boolean(item.open),
    start_time: item.start,
    end_time: item.end,
    break_start: item.breakStart || null,
    break_end: item.breakEnd || null,
    updated_at: new Date().toISOString()
  }));

  const [settingsResult, hoursResult] = await Promise.all([
    supabaseClient.from("app_settings").upsert(settings),
    supabaseClient.from("opening_hours").upsert(hours)
  ]);

  throwIfSupabaseError(settingsResult.error);
  throwIfSupabaseError(hoursResult.error);
}

async function savePolicy() {
  state.config.notificationEmail = els.notificationEmailInput.value.trim();
  state.config.businessAddress = els.businessAddressInput.value.trim();
  state.config.mapsUrl = els.mapsUrlInput.value.trim();

  try {
    await persistConfig();
    renderLocation();
    setMessage(els.policyMessage, "Datos de contacto guardados.", "success");
  } catch (error) {
    console.error(error);
    setMessage(els.policyMessage, "No se pudieron guardar los datos.", "error");
  }
}

function renderServicesEditor() {
  els.servicesEditor.innerHTML = state.services
    .map((service) => `
      <div class="service-row" data-id="${service.id}">
        <label>Nombre<input data-field="name" value="${escapeHtml(service.name)}" /></label>
        <label>Minutos<input data-field="duration" type="number" min="15" step="15" value="${service.duration}" /></label>
        <label>Precio<input data-field="price" type="number" min="0" step="500" value="${service.price}" /></label>
        <button class="danger-action" type="button" data-delete-service="${service.id}">Eliminar</button>
      </div>
    `)
    .join("");

  els.servicesEditor.querySelectorAll("input").forEach((input) => {
    input.addEventListener("change", saveServicesFromEditor);
  });

  els.servicesEditor.querySelectorAll("[data-delete-service]").forEach((button) => {
    button.addEventListener("click", () => deleteService(button.dataset.deleteService));
  });
}

async function saveServicesFromEditor() {
  state.services = Array.from(els.servicesEditor.querySelectorAll(".service-row")).map((row, index) => {
    const existing = state.services.find((item) => item.id === row.dataset.id);
    return {
      id: row.dataset.id,
      name: row.querySelector('[data-field="name"]').value.trim() || "Servicio",
      duration: clamp(Number(row.querySelector('[data-field="duration"]').value), 15, 240),
      price: Math.max(0, Number(row.querySelector('[data-field="price"]').value || 0)),
      active: true,
      sortOrder: index * 10,
      createdAt: existing?.createdAt
    };
  });

  await persistServices();
  renderServices();
  renderSlots();
}

async function addService() {
  state.services.push({ id: createId(), name: "Nuevo servicio", duration: 30, price: 0, active: true });
  await persistServices();
  renderServices();
  renderServicesEditor();
}

async function deleteService(id) {
  if (state.services.length === 1) return;
  if (supabaseClient) {
    const { error } = await supabaseClient.from("services").update({ active: false }).eq("id", id);
    throwIfSupabaseError(error);
  }
  state.services = state.services.filter((service) => service.id !== id);
  if (!supabaseClient) await persistServices();
  renderServices();
  renderServicesEditor();
  renderSlots();
}

async function persistServices() {
  if (!supabaseClient) {
    saveLocalState();
    return;
  }

  const services = state.services.map((service, index) => ({
    id: service.id,
    name: service.name,
    duration: service.duration,
    price: service.price,
    active: service.active !== false,
    sort_order: index * 10
  }));
  const { error } = await supabaseClient.from("services").upsert(services);
  throwIfSupabaseError(error);
}

async function persistAvailabilityOverrides(updates) {
  if (!supabaseClient) {
    saveLocalState();
    return;
  }

  const rows = Object.entries(updates).map(([date, item]) => ({
    date,
    open: Boolean(item.open),
    start_time: item.start,
    end_time: item.end,
    break_start: item.breakStart || null,
    break_end: item.breakEnd || null,
    updated_at: new Date().toISOString()
  }));

  const { error } = await supabaseClient.from("availability_overrides").upsert(rows);
  throwIfSupabaseError(error);
}

function renderReservations() {
  sortReservations();
  const filterDate = els.adminDateFilter.value;
  const reservations = filterDate
    ? state.reservations.filter((item) => item.date === filterDate && item.status !== "cancelled")
    : state.reservations.filter((item) => item.status !== "cancelled");

  els.reservationsList.innerHTML = reservations.length
    ? reservations.map(renderAdminReservation).join("")
    : `<p class="empty-state">No hay reservas para esta fecha.</p>`;

  els.reservationsList.querySelectorAll("[data-cancel]").forEach((button) => {
    button.addEventListener("click", () => cancelReservation(button.dataset.cancel));
  });
}

function renderBlockedSlots() {
  const filterDate = els.adminDateFilter.value;
  const blocks = state.blockedSlots
    .filter((item) => !filterDate || item.date === filterDate)
    .sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));

  els.blockedSlotsList.innerHTML = blocks.length
    ? blocks.map(renderBlockedSlot).join("")
    : `<p class="empty-state">No hay horarios bloqueados para esta fecha.</p>`;

  els.blockedSlotsList.querySelectorAll("[data-unblock]").forEach((button) => {
    button.addEventListener("click", () => unblockSlot(button.dataset.unblock));
  });
}

function renderBlockedSlot(item) {
  return `
    <article class="list-item reservation-item">
      <div>
        <strong>${formatDate(item.date)} · ${item.time} · Bloqueado</strong>
        <span>${item.duration} min${item.note ? ` · ${escapeHtml(item.note)}` : ""}</span>
      </div>
      <button class="secondary-action" type="button" data-unblock="${item.id}">Liberar</button>
    </article>
  `;
}

function renderAdminReservation(item) {
  return `
    <article class="list-item reservation-item">
      <div>
        <strong>${formatDate(item.date)} · ${item.time} · ${escapeHtml(item.serviceName)}</strong>
        <span>${escapeHtml(item.name)} · ${escapeHtml(item.email || "sin email")}${item.phone ? ` · ${escapeHtml(item.phone)}` : ""}</span>
        <span>${item.duration} min · $${Number(item.price || 0).toLocaleString("es-AR")}${item.note ? ` · ${escapeHtml(item.note)}` : ""}</span>
      </div>
      <button class="danger-action" type="button" data-cancel="${item.id}">Cancelar</button>
    </article>
  `;
}

async function cancelReservation(id) {
  const reservation = state.reservations.find((item) => item.id === id);
  if (!reservation) return;

  try {
    if (supabaseClient) {
      const { error } = await supabaseClient.from("reservations").update({ status: "cancelled" }).eq("id", id);
      throwIfSupabaseError(error);
      reservation.status = "cancelled";
    } else {
      state.reservations = state.reservations.filter((item) => item.id !== id);
      saveLocalState();
    }
    renderReservations();
    renderSlots();
  } catch (error) {
    console.error(error);
  }
}

async function blockSlot() {
  const date = els.adminDateFilter.value;
  const time = els.blockTimeInput.value;
  const duration = Number(els.blockDurationInput.value || 30);
  const note = els.blockNoteInput.value.trim();

  if (!date || !time) {
    setMessage(els.blockMessage, "Elegí fecha y horario para bloquear.", "error");
    return;
  }

  const block = {
    id: createId(),
    date,
    time,
    duration,
    note,
    createdAt: new Date().toISOString()
  };

  const start = toMinutes(time);
  const end = start + duration;
  const overlapsReservation = state.reservations.some((item) =>
    item.date === date &&
    item.status !== "cancelled" &&
    rangesOverlap(start, end, toMinutes(item.time), toMinutes(item.time) + Number(item.duration))
  );
  const overlapsBlock = state.blockedSlots.some((item) =>
    item.date === date &&
    rangesOverlap(start, end, toMinutes(item.time), toMinutes(item.time) + Number(item.duration))
  );

  if (overlapsReservation || overlapsBlock) {
    setMessage(els.blockMessage, "Ese horario se cruza con una reserva o bloqueo existente.", "error");
    return;
  }

  try {
    if (supabaseClient) {
      const { data, error } = await supabaseClient
        .from("blocked_slots")
        .insert({
          date: block.date,
          time: block.time,
          duration: block.duration,
          note: block.note
        })
        .select()
        .single();
      throwIfSupabaseError(error);
      state.blockedSlots.push(mapBlockedSlotFromDb(data));
    } else {
      state.blockedSlots.push(block);
      saveLocalState();
    }

    els.blockTimeInput.value = "";
    els.blockNoteInput.value = "";
    selectedSlot = "";
    renderBlockedSlots();
    renderSlots();
    setMessage(els.blockMessage, "Horario bloqueado.", "success");
  } catch (error) {
    console.error(error);
    setMessage(els.blockMessage, "No se pudo bloquear el horario. Revisá que la migración esté aplicada.", "error");
  }
}

async function unblockSlot(id) {
  const block = state.blockedSlots.find((item) => item.id === id);
  if (!block) return;

  try {
    if (supabaseClient) {
      const { error } = await supabaseClient.from("blocked_slots").delete().eq("id", id);
      throwIfSupabaseError(error);
    }
    state.blockedSlots = state.blockedSlots.filter((item) => item.id !== id);
    if (!supabaseClient) saveLocalState();
    selectedSlot = "";
    renderBlockedSlots();
    renderSlots();
    setMessage(els.blockMessage, "Horario liberado.", "success");
  } catch (error) {
    console.error(error);
    setMessage(els.blockMessage, "No se pudo liberar el horario.", "error");
  }
}

async function savePassword() {
  const password = els.newPinInput.value.trim();
  const minLength = supabaseClient ? 6 : 4;
  if (password.length < minLength) {
    setMessage(els.pinMessage, `Usá una contraseña de al menos ${minLength} caracteres.`, "error");
    return;
  }

  try {
    if (supabaseClient) {
      const { error } = await supabaseClient.auth.updateUser({ password });
      throwIfSupabaseError(error);
    } else {
      localStorage.setItem(ADMIN_KEY, password);
    }

    els.newPinInput.value = "";
    setMessage(els.pinMessage, "Contraseña actualizada.", "success");
  } catch (error) {
    console.error(error);
    setMessage(els.pinMessage, "No se pudo actualizar la contraseña.", "error");
  }
}

async function saveRecoveryPassword() {
  const password = els.resetPasswordInput.value.trim();
  if (password.length < 6) {
    setMessage(els.resetMessage, "Usá una contraseña de al menos 6 caracteres.", "error");
    return;
  }

  try {
    const { error } = await supabaseClient.auth.updateUser({ password });
    throwIfSupabaseError(error);
    await supabaseClient.auth.signOut();
    els.resetPasswordInput.value = "";
    setMessage(els.resetMessage, "Contraseña actualizada. Ya podés entrar con el email admin.", "success");
    window.history.replaceState(null, "", `${window.location.pathname}?admin=1`);
    els.resetPasswordButton.disabled = true;
  } catch (error) {
    console.error(error);
    setMessage(els.resetMessage, "No se pudo actualizar. Pedí otro link de recuperación e intentá de nuevo.", "error");
  }
}

async function refreshReservationsForCurrentRange() {
  if (!supabaseClient) return;

  const from = els.dateInput.value || toDateInput(new Date());
  const to = els.adminDateFilter.value || from;
  const manageDate = els.manageDateInput.value;
  const dates = Array.from(new Set([from, to, manageDate])).filter(Boolean);
  const table = adminMode ? "reservations" : "reservation_slots";
  const query = supabaseClient.from(table).select("*").in("date", dates);
  const { data, error } = adminMode ? await query.neq("status", "cancelled") : await query;
  throwIfSupabaseError(error);

  const existingOtherDates = state.reservations.filter((item) => !dates.includes(item.date));
  state.reservations = [...existingOtherDates, ...(data || []).map(mapReservationSlotFromDb)];
  await refreshBlockedSlotsForDates(dates);
}

async function refreshReservationsForDate(date) {
  if (!supabaseClient || !date) return;

  const table = adminMode ? "reservations" : "reservation_slots";
  const query = supabaseClient.from(table).select("*").eq("date", date);
  const { data, error } = adminMode ? await query.neq("status", "cancelled") : await query;
  throwIfSupabaseError(error);

  const existingOtherDates = state.reservations.filter((item) => item.date !== date);
  state.reservations = [...existingOtherDates, ...(data || []).map(mapReservationSlotFromDb)];
  await refreshBlockedSlotsForDates([date]);
}

async function refreshBlockedSlotsForDates(dates) {
  if (!supabaseClient || !dates.length) return;

  const { data, error } = await supabaseClient.from("blocked_slots").select("*").in("date", dates);
  if (error) {
    console.warn("No se pudieron actualizar los horarios bloqueados", error);
    return;
  }

  const existingOtherDates = state.blockedSlots.filter((item) => !dates.includes(item.date));
  state.blockedSlots = [...existingOtherDates, ...(data || []).map(mapBlockedSlotFromDb)];
}

function getScheduleForDate(date) {
  const override = state.availabilityOverrides?.[date];
  if (override) return override;

  const day = new Date(`${date}T12:00:00`).getDay();
  return state.config.hours[day];
}

function getSelectedService() {
  return state.services.find((service) => service.id === els.serviceSelect.value) || state.services[0];
}

function getSelectedManageService() {
  return state.services.find((service) => service.id === els.manageServiceSelect.value) || state.services[0];
}

function sortReservations() {
  state.reservations.sort((a, b) => `${a.date}T${a.time}`.localeCompare(`${b.date}T${b.time}`));
}

function mapOpeningHoursFromDb(rows) {
  const hours = structuredClone(defaultState.config.hours);
  rows.forEach((item) => {
    hours[item.weekday] = {
      open: item.open,
      start: stripSeconds(item.start_time),
      end: stripSeconds(item.end_time),
      breakStart: stripSeconds(item.break_start || ""),
      breakEnd: stripSeconds(item.break_end || "")
    };
  });
  return hours;
}

function mapAvailabilityOverridesFromDb(rows) {
  return rows.reduce((acc, item) => {
    acc[item.date] = {
      open: item.open,
      start: stripSeconds(item.start_time),
      end: stripSeconds(item.end_time),
      breakStart: stripSeconds(item.break_start || ""),
      breakEnd: stripSeconds(item.break_end || "")
    };
    return acc;
  }, {});
}

function normalizeOpeningHours(hours) {
  const isOldSeed =
    !hours[0]?.open &&
    !hours[1]?.open &&
    hours[2]?.open &&
    hours[2]?.start === "14:00" &&
    hours[2]?.end === "20:30" &&
    hours[6]?.open &&
    hours[6]?.start === "09:00" &&
    hours[6]?.end === "17:00";

  return isOldSeed ? structuredClone(defaultState.config.hours) : hours;
}

function normalizeServices(services) {
  return services.length ? services : [{ ...mvpService, id: createId() }];
}

function mapServiceFromDb(item) {
  return {
    id: item.id,
    name: item.name,
    duration: item.duration,
    price: item.price,
    active: item.active,
    sortOrder: item.sort_order
  };
}

function mapReservationSlotFromDb(item) {
  return {
    id: item.id || `${item.date}-${item.time}`,
    serviceId: item.service_id || "",
    serviceName: item.service_name || "Reservado",
    duration: item.duration,
    price: item.price || 0,
    date: item.date,
    time: stripSeconds(item.time),
    name: item.name || "Reservado",
    email: item.email || "",
    phone: item.phone || "",
    note: item.note || "",
    status: item.status || "confirmed",
    createdAt: item.created_at,
    manageToken: item.manage_token || ""
  };
}

function mapReservationFromDb(item) {
  return mapReservationSlotFromDb(Array.isArray(item) ? item[0] : item);
}

function mapBlockedSlotFromDb(item) {
  return {
    id: item.id,
    date: item.date,
    time: stripSeconds(item.time),
    duration: item.duration,
    note: item.note || "",
    createdAt: item.created_at
  };
}

function hideConfirmation() {
  els.confirmationBox.classList.add("hidden");
  els.confirmationBox.innerHTML = "";
}

function formatServiceLabel(service) {
  const price = Number(service.price || 0);
  return `${service.name} - ${service.duration} min${price ? ` - $${price.toLocaleString("es-AR")}` : ""}`;
}

function getNoSlotsMessage(date) {
  const rules = getScheduleForDate(date);
  if (!rules || !rules.open) return "Ese día la barbería está cerrada. Probá con otra fecha.";
  if (date === toDateInput(new Date())) return "Por hoy ya no quedan horarios disponibles. Probá con el próximo día abierto.";
  return "No hay horarios libres para esta fecha. Probá con otro día cercano.";
}

function normalizeMapsUrl(url, address) {
  const trimmedUrl = url?.trim();
  if (trimmedUrl) return trimmedUrl;
  const trimmedAddress = address?.trim();
  if (!trimmedAddress) return "";
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(trimmedAddress)}`;
}

function throwIfSupabaseError(error) {
  if (error) throw error;
}

function stripSeconds(value) {
  if (!value) return "";
  return String(value).slice(0, 5);
}

function rangesOverlap(startA, endA, startB, endB) {
  return startA < endB && startB < endA;
}

function toMinutes(time) {
  const [hours, minutes] = time.split(":").map(Number);
  return hours * 60 + minutes;
}

function fromMinutes(total) {
  const hours = String(Math.floor(total / 60)).padStart(2, "0");
  const minutes = String(total % 60).padStart(2, "0");
  return `${hours}:${minutes}`;
}

function isPastSlot(date, minute) {
  const now = new Date();
  return new Date(`${date}T${fromMinutes(minute)}:00`) <= now;
}

function toDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function toMonthInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${year}-${month}`;
}

function getMonthDates(monthValue) {
  const [year, month] = monthValue.split("-").map(Number);
  const cursor = new Date(year, month - 1, 1, 12);
  const today = toDateInput(new Date());
  const dates = [];

  while (cursor.getMonth() === month - 1) {
    const date = toDateInput(cursor);
    if (monthValue !== toMonthInput(new Date()) || date >= today) {
      dates.push(date);
    }
    cursor.setDate(cursor.getDate() + 1);
  }

  return dates;
}

function formatDate(date) {
  return new Intl.DateTimeFormat("es-AR", {
    weekday: "short",
    day: "2-digit",
    month: "short"
  }).format(new Date(`${date}T12:00:00`));
}

function buildCalendarUrl(reservation) {
  const start = compactCalendarDateTime(reservation.date, reservation.time);
  const end = compactCalendarDateTime(reservation.date, fromMinutes(toMinutes(reservation.time) + Number(reservation.duration || 30)));
  const details = [
    `Servicio: ${reservation.serviceName}`,
    `Duracion: ${reservation.duration} min`,
    reservation.note ? `Nota: ${reservation.note}` : ""
  ].filter(Boolean).join("\n");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `Turno - Barbería Mariano Martínez`,
    dates: `${start}/${end}`,
    details,
    ctz: "America/Argentina/Buenos_Aires"
  });

  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

function compactCalendarDateTime(date, time) {
  return `${date.replaceAll("-", "")}T${stripSeconds(time).replace(":", "")}00`;
}

function clamp(value, min, max) {
  if (Number.isNaN(value)) return min;
  return Math.min(max, Math.max(min, value));
}

function setMessage(element, text, type) {
  element.textContent = text;
  element.className = `message ${type}`;
}

function clearMessage(element) {
  element.textContent = "";
  element.className = "message";
}

function setOnlineUnavailableState() {
  selectedSlot = "";
  els.slotsGrid.innerHTML = `<p class="empty-state">Agenda online no disponible.</p>`;
  els.bookingForm.querySelector("button[type='submit']").disabled = true;
  setMessage(els.bookingMessage, "La agenda online no está disponible. Probá más tarde.", "error");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function createId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}
