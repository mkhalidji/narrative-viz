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

  const zoom = d3.zoom().scaleExtent([1, 8]).on("zoom", zoomed);

  const svg = d3
    .select("svg")
    .attr("viewBox", [0, 0, width, height])
    .on("click", reset);

  const path = d3.geoPath();

  const g = svg.append("g");

  const states = g
    .attr("cursor", "pointer")
    .attr("fill", "#4453")
    .selectAll("g")
    .data(topojson.feature(us, us.objects.states).features)
    .join("g")
    .on("click", stateClicked);

  g.selectAll("g").attr("fill", ({ properties: { name: state } }) => {
    return casesColor(covidData[state].rate);
  });

  states
    .append("path")
    .attr("d", path)
    .on("clicked", stateClicked)
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

  svg.call(zoom);

  g.append("path")
    .attr("fill", "none")
    .attr("stroke", "#a2a2a2")
    .attr("d", path(topojson.mesh(us, us.objects.nation)));

  let zoomedState = undefined;

  function reset() {
    console.log(this);
    states.transition().style("opacity", null);
    svg
      .transition()
      .duration(750)
      .call(
        zoom.transform,
        d3.zoomIdentity,
        d3.zoomTransform(svg.node()).invert([width / 2, height / 2])
      );

    zoomedState = undefined;
  }

  function stateClicked(event, d) {
    const stateName = covidData[d3.select(this).datum().properties.name];
    if (zoomedState !== undefined && zoomedState === stateName) {
      return reset.call(this);
    }
    zoomedState = stateName;
    const [[x0, y0], [x1, y1]] = path.bounds(d);
    event.stopPropagation();
    states.transition().style("fill", null);
    d3.select(this).transition().style("opacity", "0.8");
    svg
      .transition()
      .duration(750)
      .call(
        zoom.transform,
        d3.zoomIdentity
          .translate(width / 2, height / 2)
          .scale(
            Math.min(8, 0.9 / Math.max((x1 - x0) / width, (y1 - y0) / height))
          )
          .translate(-(x0 + x1) / 2, -(y0 + y1) / 2),
        d3.pointer(event, svg.node())
      );
  }

  function zoomed(event) {
    const { transform } = event;
    g.attr("transform", transform);
    g.attr("stroke-width", 1 / transform.k);
  }
};
