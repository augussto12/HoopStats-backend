export function getArgentinaDates() {
    // Fecha actual en ARG
    const nowArg = new Date(
        new Date().toLocaleString("en-US", {
            timeZone: "America/Argentina/Buenos_Aires",
        })
    );

    const today = new Date(nowArg);
    const yesterday = new Date(nowArg);
    yesterday.setDate(yesterday.getDate() - 1);

    const toISODate = (d: Date) =>
        d.toISOString().slice(0, 10);

    return {
        today: toISODate(today),
        yesterday: toISODate(yesterday),
    };
}
