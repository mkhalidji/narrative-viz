const state = {
  zoomedState: undefined,
};

async function showMap() {
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
    // .attr("fill", "#4453")
    .attr("fill", "whitesmoke")
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
    .attr("id", "state-borders")
    .attr("fill", "none")
    .attr("stroke", "#a2a2a2")
    .attr("stroke-linejoin", "round")
    .attr("d", path(topojson.mesh(us, us.objects.states, (a, b) => a !== b)));

  svg.call(zoom);

  g.append("path")
    .attr("id", "us-border")
    .attr("fill", "none")
    .attr("stroke", "#a2a2a2")
    .attr("d", path(topojson.mesh(us, us.objects.nation)));

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
    const marginWidth = width / 5;
    const marginHeight = height / 5;

    const { state: stateName } =
      covidData[d3.select(this).datum().properties.name];
    if (zoomedState !== undefined && zoomedState === stateName) {
      return reset.call(this);
    }
    zoomedState = stateName;
    const { id: stateId } = d3.select(this).datum();
    const { geometries } = us.objects.counties;
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
      .append("path")
      .attr("fill", "none")
      .attr("stroke", () => borderColor(+covidData[stateName].rate))
      .attr("stroke-linejoin", "round")
      .attr(
        "d",
        path(
          topojson.mesh(
            us,
            us.objects.states,
            (a, b) =>
              a.properties.name === stateName || b.properties.name === stateName
          )
        )
      );
    d3.select("#county-borders")
      .transition()
      .duration(750)
      .style("opacity", 1, "important");
    states
      .filter(({ properties: { name } }) => stateName !== name)
      .transition()
      .duration(750)
      .style("display", "none");
    d3.selectAll("#state-borders, #us-border")
      .transition()
      .duration(750)
      .style("display", "none");
    d3.select(this)
      .transition()
      .duration(750)
      .call(
        zoom.transform,
        d3.zoomIdentity
          .scale(
            d3.min([
              (marginWidth - 10) / (x1 - x0),
              (marginHeight - 10) / (y1 - y0),
            ])
          )
          .translate(-x0 + 10, -y0 + 10)
      );
  }

  function zoomed(event) {
    const { transform } = event;
    g.attr("transform", transform);
    g.attr("stroke-width", 1 / transform.k);
  }
}

async function showMandates() {
  const mandates = await d3.csv(
    "data/State-Level_Vaccine_Mandates_-_All_20240723.csv",
    ({ state, effective_date }) => ({
      state,
      effective_date: new Date(effective_date),
    })
  );

  const dates = mandates.map((d) => d.effective_date);

  const width = 975,
    height = 610,
    marginBottom = 100;
  const xScale = d3
    .scaleTime()
    .domain([d3.min(dates), d3.max(dates)])
    .nice()
    .range([10, width - 10]);

  const svg = d3
    .select("svg")
    .attr("viewBox", [0, 0, width, height])
    .attr("width", width)
    .attr("height", height);

  const dots = svg
    .selectAll("circle")
    .data(mandates)
    .join("circle")
    .attr("cx", ({ effective_date }) => xScale(effective_date))
    .attr("cy", height / 2)
    .attr("r", 2.5)
    .attr("fill", "whitesmoke");

  dots
    .append("title")
    .text(({ state, effective_date }) => `${state} on ${effective_date}`);

  svg
    .append("g")
    .attr("transform", `translate(0,${height - marginBottom})`)
    .call(
      d3
        .axisBottom(xScale)
        .ticks(d3.timeMonth.every(1))
        .tickFormat((date) => {
          const month = date.getMonth(),
            year = date.getFullYear();
          const monthName = [
            year,
            "Feb",
            "Mar",
            "Apr",
            "May",
            "Jun",
            "Jul",
            "Aug",
            "Sep",
            "Oct",
            "Nov",
            "Dec",
          ];

          return monthName[month];
        })
    );

  const parseTime = d3.timeParse("%d-%b-%y");
  const timeFormat = d3.timeFormat("%d-%b-%y");

  //Skipping setting domains for sake of example
  const x = d3.scaleTime().range([0, 800]);
  const y = d3.scaleLinear().range([300, 0]);
  const type = d3.annotationCallout;

  const annotationGroup = svg
    .append("g")
    .attr("class", "annotation-group")
    .attr("fill", "white");

  dots.each(function (d, i) {
    d3.select(this)
      .on("click", function () {})
      .on("mouseover", function () {
        const makeAnnotations = d3
          .annotation()
          .type(type)
          .accessors({
            x: ({ effective_date }) => xScale(effective_date),
            y: () => height / 2,
          })
          .accessorsInverse({
            effective_date: (d) => timeFormat(x.invert(d.x)),
          })
          .annotations([
            {
              note: {
                title: `${d3.timeFormat("%B %Y")(d.effective_date)}`,
                label: `${d.state}`,
              },
              data: d,
              className: "show-bg",
              dy: -50,
              dx: 100,
            },
          ]);

        annotationGroup.call(makeAnnotations);
      })
      .on("mouseout", function () {
        annotationGroup.call(d3.annotation().annotations([]));
      });
  });
}

window.onload = showMap;
