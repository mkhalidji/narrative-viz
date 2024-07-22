const pageState = {
  currentPage: 0,
};

const pages = [
  {
    content: "<svg></svg>",
  },
  { content: "This is the middle page." },
  { content: "This is the last page." },
];

const pageCount = pages.length;

function refreshPage() {
  const { currentPage } = pageState;

  const viz = document.getElementById("viz");
  viz.innerHTML = pages[currentPage].content;

  const leftNav = document.getElementById("left-nav");
  const rightNav = document.getElementById("right-nav");

  if (currentPage === 0) {
    leftNav.classList.add("disabled");
  } else {
    leftNav.classList.remove("disabled");
  }

  if (currentPage === pageCount - 1) {
    rightNav.classList.add("disabled");
  } else {
    rightNav.classList.remove("disabled");
  }
}

function onNavClick(direction) {
  const { currentPage } = pageState;

  if (direction > 0 && currentPage + 1 < pageCount) {
    Object.assign(pageState, { currentPage: currentPage + 1 });
  } else if (direction < 0 && currentPage > 0) {
    Object.assign(pageState, { currentPage: currentPage - 1 });
  }

  refreshPage();
}

window.onload = async function () {
  refreshPage();

  const width = 975;
  const height = 610;

  const us = await d3.json("data/counties-albers-10m.json");
  let covidData;
  try {
    covidData = await d3.csv(
      "https://raw.githubusercontent.com/nytimes/covid-19-data/master/us-states.csv"
    );
  } catch (e) {
    console.log(e);
  }

  const getCovidDataForDate = (data, targetDate) => {
    return Object.assign(
      {},
      ...data
        .filter(({ date }) => date === targetDate)
        .map(({ state, cases, deaths }) => ({
          state,
          cases: parseInt(cases),
          deaths: parseInt(deaths),
        }))
        .map((d) => ({ [d.state]: { ...d } }))
    );
  };

  const covidDataYesterday = getCovidDataForDate(covidData, "2020-04-15");
  const covidDataToday = getCovidDataForDate(covidData, "2021-10-10");
  covidData = Object.assign(
    {},
    ...Object.keys(covidDataToday).map((state) => {
      if (!covidDataToday[state] || !covidDataYesterday[state]) {
        return {};
      }
      const cases =
        covidDataToday[state].cases - covidDataYesterday[state].cases;
      const deaths =
        covidDataToday[state].deaths - covidDataYesterday[state].deaths;
      const rate = (
        cases > 0 && deaths > 0 ? (deaths / cases) * 100.0 : 0.0
      ).toFixed(2);
      return { [state]: { state, cases, deaths, rate } };
    })
  );
  console.log(covidData);

  const upperLimit = Math.floor(
    Math.max(...Object.values(covidData).map(({ rate }) => rate))
  );
  console.log(upperLimit);

  const casesColor = d3
    .scaleDivergingPow([0.5, 1.0, 1.5], ["#22763f", "#f4cf64", "#be2a3e"])
    .clamp(true);

  // const zoom = d3.zoom().scaleExtent([1, 8]);

  const svg = d3
    .select("svg")
    .attr("viewBox", [0, 0, width, height]);

  const path = d3.geoPath();

  const g = svg.append("g");

  const states = g
    .attr("cursor", "pointer")
    .attr("fill", "#4453")
    .selectAll("g")
    .data(topojson.feature(us, us.objects.states).features)
    .join("g");

  g.selectAll("g").attr("fill", ({ properties: { name: state } }) => {
    return casesColor(covidData[state].rate);
  });

  states
    .append("path")
    .attr("d", path)
    .append("title")
    .text(({ properties: { name: state } }) => {
      const { cases, deaths, rate } = covidData[state];

      return `${state}\nCases: ${cases}\nDeaths: ${deaths}\nRate: ${rate}%`;
    });

  g.append("path")
    .attr("fill", "none")
    .attr("stroke", "#a2a2a2")
    .attr("stroke-linejoin", "round")
    .attr("d", path(topojson.mesh(us, us.objects.states, (a, b) => a !== b)));

  g.append("path")
    .attr("fill", "none")
    .attr("stroke", "#a2a2a2")
    .attr("d", path(topojson.mesh(us, us.objects.nation)));
};
