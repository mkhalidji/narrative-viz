const pageState = {
  currentPage: 1,
};

const pages = [
  {
    content: "<svg></svg>",
  },
  { content: "<svg></svg>" },
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

async function showMap() {
  refreshPage();

  const width = 975;
  const height = 610;

  const cities = await d3.json("data/us_cities.geojson");
  const us = await d3.json("data/counties-albers-10m.json");
  let covidData;
  try {
    covidData = await d3.csv(
      "https://raw.githubusercontent.com/mkhalidji/covid-19-data/master/us-states.csv"
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

  const upperLimit = Math.floor(
    Math.max(...Object.values(covidData).map(({ rate }) => rate))
  );

  const casesColor = d3
    .scaleDivergingPow([0.5, 1.0, 1.5], ["#22763f", "#f4cf64", "#be2a3e"])
    .clamp(true);

  const borderColor = d3
    .scaleDiverging([0.5, 1.0, 1.5], ["lightgrey", "#000", "lightgrey"])
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

  states.attr("fill", ({ properties: { name: state } }) => {
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

  // const projection = d3
  //   .geoAlbersUsa()
  //   .scale(1300)
  //   .translate([width / 2, height / 2]);
  // const cityNodes = g
  //   .selectAll("g")
  //   .data(
  //     cities.features.map(({ geometry: { coordinates }, properties }) => ({
  //       coordinates: projection(coordinates),
  //       properties,
  //     }))
  //   )
  //   .join("g");

  // console.log(cityNodes.data());

  // cityNodes
  //   .append("circle")
  //   .attr("fill", "black")
  //   .attr("r", 2)
  //   .attr("cx", ({ coordinates }) => coordinates[0])
  //   .attr("cy", ({ coordinates }) => coordinates[1])
  //   .append("title")
  //   .text(({ properties: { name } }) => name);

  // cityNodes.append("title").text((d) => d.properties.name);

  let zoomedState = undefined;

  function reset() {
    d3.select(this)
      .selectChild("path")
      .transition()
      .duration(750)
      .style("transform", null);
    d3.select("#county-borders")
      .transition()
      .duration(750)
      .style("opacity", 0)
      .remove();
    states
      .transition()
      .duration(750)
      .style("opacity", null)
      .style("z-index", 10, "important");
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
    const { state: stateName } =
      covidData[d3.select(this).datum().properties.name];
    if (zoomedState !== undefined && zoomedState === stateName) {
      return reset.call(this);
    }
    zoomedState = stateName;
    const { id: stateId } = d3.select(this).datum();
    const { geometries } = us.objects.counties;
    console.log(us.objects.counties);
    const stateCounties = Object.assign({}, us.objects.counties, {
      geometries: geometries.filter(({ id }) => id.startsWith(stateId)),
    });
    const [[x0, y0], [x1, y1]] = path.bounds(d);
    event.stopPropagation();
    states.transition().style("fill", null);
    d3.select(this)
      .append("path")
      .attr("id", "county-borders")
      .attr("fill", "none")
      .attr("stroke", () => borderColor(+covidData[stateName].rate))
      .style("opacity", 0)
      .attr("stroke-linejoin", "round")
      .attr("d", path(topojson.mesh(us, stateCounties, (a, b) => a !== b)));
    d3.select(this)
      .raise()
      .selectChild("path")
      .transition()
      .duration(750)
      .style("transform", "translate(-1px, -1px)");
    d3.select("#county-borders")
      .transition()
      .duration(750)
      .style("transform", "translate(-1px, -1px)")
      .style("opacity", 1, "important");
    states
      .filter(({ properties: { name } }) => stateName !== name)
      .transition()
      .duration(750)
      .style("opacity", "0.2")
      .style("z-index", 10, "important");
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
}

async function showMandates() {
  const mandateData = await d3.csv(
    "data/State-Level_Vaccine_Mandates_-_All_20240723.csv",
    ({ state, effective_date }) => ({
      state,
      effective_date: new Date(effective_date),
    })
  );
  console.log(mandateData);

  const width = 975;
  const height = 610;

  const svg = d3
    .select("svg")
    .attr("viewBox", [0, 0, width, height])
    .attr("width", width)
    .attr("height", height);
  svg
    .selectAll("text")
    .data(mandateData)
    .join("svg:text")
    .attr("x", "10")
    .attr("y", (_, i) => 10 + 20 * i)
    .attr("stroke", "whitesmoke")
    .text(({ state, effective_date }) => `${state} on ${effective_date}`);
}

window.onload = showMandates;
