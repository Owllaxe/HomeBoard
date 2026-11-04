// One line of weather for the pass, from Open-Meteo, which needs no key. It's asked about the
// home station's position, so no address leaves the board.
window.Weather = (() => {
  const LOOK_AHEAD = 12;
  const WET = 50; // Percent chance that's worth carrying an umbrella for

  async function load(lat, lon) {
    const query = new URLSearchParams({
      latitude: lat, longitude: lon, current: "temperature_2m",
      hourly: "precipitation_probability,snowfall", temperature_unit: "fahrenheit",
      timeformat: "unixtime", forecast_days: 2,
    });
    const response = await fetch(`https://api.open-meteo.com/v1/forecast?${query}`);
    if (!response.ok) throw new Error(response.status);
    return { ...(await response.json()), fetched: Date.now() };
  }

  const hourName = (ms) => new Date(ms).toLocaleTimeString("en-US", { hour: "numeric" }).toLowerCase();

  // Says what to do about it, because that's the part that changes anything. The forecast is
  // always fetched in Fahrenheit, so switching units needs no new request.
  function line(forecast, now, units = "f") {
    const { current, hourly } = forecast;
    const degrees = units === "c" ? (current.temperature_2m - 32) * 5 / 9 : current.temperature_2m;
    const temperature = `${Math.round(degrees)}°`;
    const next = hourly.time
      .map((time, i) => ({ at: time * 1000, chance: hourly.precipitation_probability[i], snow: hourly.snowfall[i] }))
      .filter((h) => h.at + 3600000 > now && h.at < now + LOOK_AHEAD * 3600000)
      .find((h) => h.chance >= WET);
    if (!next) return `${temperature}, staying dry`;
    const what = next.snow > 0 ? "snow" : "rain";
    const when = next.at <= now ? `${what} now` : `${what} around ${hourName(next.at)}`;
    return `${temperature}, ${when}, ${what === "snow" ? "dress for it" : "take an umbrella"}`;
  }

  return { load, line };
})();
