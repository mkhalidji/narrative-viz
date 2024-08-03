const pageState = {
  currentPage: 0,
  pages: [],
  zoomedState: undefined,
  counties_g: undefined,
  dateRange: undefined,
  selectedStates: ['California', 'Florida'],
  us: undefined,
  geoData: undefined,
  countyData: new d3.InternMap(),
  mandateData: undefined,
  zoomDateExtent: undefined,
};

function pleaseWait(selection, width, height) {
  selection
    .append('text')
    .text('Loading data... please wait')
    .style('font-size', '18pt')
    .attr('x', function () {
      const bbox = this.getBBox();
      return (width - bbox.width) / 2;
    })
    .attr('y', function () {
      const bbox = this.getBBox();
      return (height - bbox.height) / 2;
    })
    .attr('fill', 'white');
}

function makeQuantileChoropleth(quantileData) {
  const nQuantile = 5;

  const rawColorScale = d3
    .scaleDiverging(
      [0, nQuantile ** 2 / 2, nQuantile ** 2 - 1],
      ['#22763f', '#f4cf64', '#be2a3e']
    )
    .clamp(true);

  const scaleColors = d3.range(nQuantile ** 2).map((q) => rawColorScale(q));

  const casesQuantile = (data) =>
    d3.scaleQuantile(
      data.map((d) => d.cases),
      d3.range(nQuantile)
    );

  const deathsQuantile = (data) =>
    d3.scaleQuantile(
      data.map((d) => d.deaths),
      d3.range(nQuantile)
    );

  const choropleth = ({ cases, deaths }) =>
    scaleColors[
      casesQuantile(quantileData)(cases) +
        nQuantile * deathsQuantile(quantileData)(deaths)
    ];

  return choropleth;
}

const formatStats = (
  region,
  { cases, casesPerCapita, deaths, deathsPerCapita }
) =>
  `${region}\nCases: ${cases}\nCases (% of population): ${casesPerCapita.toFixed(
    2
  )}%\nDeaths: ${deaths}\nDeaths (% of population): ${deathsPerCapita.toFixed(
    3
  )}%`;

async function showIntroduction() {}

async function showNationalTrends() {}

async function showStateTrends() {
  const mapWidth = 975;
  const mapHeight = 610;
  const mapMargin = { bottom: 20 };
  const chartMargin = { left: 100 };
  const chartHeight = 120;

  const width = mapWidth;
  const height = mapHeight + mapMargin.bottom + chartHeight;

  d3.select('#left-nav')
    .classed('enabled', pageState.currentPage > 0)
    .on('click', function (event) {
      if (d3.select(this).classed('enabled')) {
        pageState.currentPage--;
      }
    });
  d3.select('#right-nav')
    .classed('enabled', pageState.currentPage < 2)
    .on('click', function (event) {
      if (d3.select(this).classed('enabled')) {
        pageState.currentPage++;
        d3.select('.viewport').html('<svg></svg>');
        return showGraphs();
      }
    });

  const svg = d3.select('svg').attr('viewBox', [0, 0, width, height]);

  svg.call(pleaseWait, width, height);

  const data = pageState.geoData || (await loadStatesData());
  pageState.geoData = data;

  const { us, national, states, statesPopulation, countiesPopulation } = data;

  const [startDate, endDate] = (pageState.dateRange = d3.extent(
    national,
    (d) => d.date
  ));

  const filterStateDataToInterval = (sd, ed) => {
    const intervalStates = d3.filter(
      states,
      (d) => d.date >= sd && d.date <= ed
    );

    return topojson.feature(us, us.objects.states).features.map((feature) => {
      const {
        properties: { name: stateName },
        id,
      } = feature;
      const values = d3
        .filter(intervalStates, (d) => d.state === stateName)
        .sort((a, b) => a.date.getTime() - b.date.getTime());
      const cases = values[values.length - 1].cases - values[0].cases;
      const deaths = values[values.length - 1].deaths - values[0].deaths;
      return {
        ...feature,
        cases,
        deaths,
        casesPerCapita: (cases / statesPopulation[id]) * 100,
        deathsPerCapita: (deaths / statesPopulation[id]) * 100,
      };
    });
  };

  const quantileData = filterStateDataToInterval(startDate, endDate);

  const choropleth = makeQuantileChoropleth(quantileData);

  const borderColor = d3
    .scaleDiverging([0, 25000, 75000], ['lightgrey', '#000', 'lightgrey'])
    .clamp(true);

  const zoom = d3.zoom().scaleExtent([1, 8]).on('zoom', zoomed);

  const xScale = d3
    .scaleTime()
    .domain([startDate, endDate])
    .range([chartMargin.left, width - 10]);

  const yScale = d3
    .scaleLinear()
    .domain([0, d3.max(national, (d) => d.cases)])
    .range([
      mapHeight + mapMargin.bottom + chartHeight - 20,
      mapHeight + mapMargin.bottom + 10,
    ]);

  const area = (xs, ys) =>
    d3
      .area()
      .x((d) => xs(d.date))
      .y0(yScale(0))
      .y1((d) => ys(d.cases));

  const brush = d3
    .brushX()
    .extent([
      [chartMargin.left, mapHeight + mapMargin.bottom - 1],
      [width - 10, mapHeight + mapMargin.bottom + chartHeight - 20 + 1],
    ])
    .on('brush', brushed)
    .on('end', brushended);

  svg.selectAll('text').remove();

  svg
    .append('path')
    .datum(national)
    .attr('fill', 'steelblue')
    .attr('stroke', 'whitesmoke')
    .attr('d', area(xScale, yScale));

  svg
    .append('g')
    .attr('transform', `translate(${chartMargin.left}, 0)`)
    .call(d3.axisLeft(yScale).ticks(3));
  svg
    .append('g')
    .attr('transform', `translate(0, ${height - 20})`)
    .call(d3.axisBottom(xScale));

  const path = d3.geoPath();

  const g = svg.append('g');

  const states_g = g
    .attr('cursor', 'pointer')
    // .attr("fill", "#4453")
    .attr('fill', 'whitesmoke')
    .selectAll('g')
    .data(filterStateDataToInterval(startDate, endDate))
    .join('g')
    .on('click', stateClicked);

  states_g.attr('fill', (d) => {
    return choropleth(d);
  });

  states_g
    .append('path')
    .attr('d', path)
    .append('title')
    .text(({ properties: { name: state }, ...stats }) =>
      formatStats(state, stats)
    );

  g.append('path')
    .attr('id', 'state-borders')
    .attr('fill', 'none')
    .attr('stroke', '#a2a2a2')
    .attr('stroke-linejoin', 'round')
    .attr('d', path(topojson.mesh(us, us.objects.states, (a, b) => a !== b)));

  g.append('path')
    .attr('id', 'us-border')
    .attr('fill', 'none')
    .attr('stroke', '#a2a2a2')
    .attr('d', path(topojson.mesh(us, us.objects.nation)));

  const defaultSelection = xScale.range();
  const gb = svg.append('g');

  const tracker = svg
    .append('g')
    .classed('mouse', true)
    .style('display', 'none');
  tracker
    .append('rect')
    .attr('pointer-events', 'none')
    .attr('width', 2)
    .attr('x', -1)
    .attr('y', mapHeight + mapMargin.bottom)
    .attr('height', chartHeight - 20)
    .attr('fill', 'lightgray');
  tracker
    .append('circle')
    .attr('pointer-events', 'none')
    .attr('r', 5)
    .attr('stroke', 'steelblue');
  tracker.append('text');

  gb.call(brush)
    .call(brush.move, defaultSelection)
    .on('mouseover', function (event) {
      tracker.style('display', 'block');
    })
    .on('mousemove', function (event) {
      const x = d3.pointer(event, gb.node())[0];
      const currentDate = xScale.invert(x);
      const index = d3.minIndex(national, (d) =>
        Math.abs(d.date.getTime() - currentDate.getTime())
      );
      const { date, cases, deaths } = national[index];
      tracker.attr('transform', `translate(${xScale(date)}, ${0})`);
      tracker
        .select('text')
        .attr('fill', 'whitesmoke')
        .attr('text-anchor', x > width - 150 ? 'end' : 'start')
        .selectChildren('tspan')
        .data([date.toDateString(), `Cases: ${cases}`, `Deaths: ${deaths}`])
        .join('tspan')
        .attr('pointer-events', 'none')
        .attr('x', 5)
        .attr('y', (_d, i) => yScale(cases) + 20 * i - 50)
        .text((d) => d);
      tracker.select('circle').attr('cy', yScale(cases));
    })
    .on('mouseout', (event) => {
      tracker.style('display', 'none');
    })
    .on('dblclick', function () {
      gb.call(brush.move, defaultSelection);
    });

  async function brushed({ selection }) {
    if (selection) {
      const [startDate, endDate] = (pageState.dateRange = selection.map(
        xScale.invert
      ));
      if (pageState.zoomedState === undefined) {
        states_g
          .data(filterStateDataToInterval(startDate, endDate))
          .attr('fill', (d) => choropleth(d))
          .selectChild('path')
          .attr('d', path)
          .selectChild('title')
          .text(({ properties: { name: state }, ...stats }) =>
            formatStats(state, stats)
          );
        gb.select('title').text(
          `${startDate.toDateString()}-${endDate.toDateString()}`
        );
      } else {
        const key = [pageState.zoomedState, startDate, endDate];
        const quantileData =
          pageState.countyData.get(key) ||
          (await filterCountyDataToInterval(
            pageState.zoomedState,
            startDate,
            endDate
          ));
        pageState.countyData.set(key, quantileData);

        const choropleth = makeQuantileChoropleth(quantileData);
        pageState.counties_g
          .data(quantileData)
          .attr('fill', (d) => choropleth(d))
          .selectChild('path')
          .attr('d', path)
          .select('title')
          .text(({ properties: { name: county }, ...stats }) =>
            formatStats(county, stats)
          );
      }
    }
  }

  function brushended({ selection }) {
    if (!selection) {
      gb.call(brush.move, defaultSelection);
    }
  }

  async function reset(event, d) {
    const marginWidth = mapWidth / 5;
    const marginHeight = mapHeight / 5;

    const {
      properties: { name: stateName },
    } = d;

    const [[x0, y0], [x1, y1]] = path.bounds(d);

    const selection = d3.select(this);
    const transform = d3.zoomTransform(d3.select(this).node());

    // d3.select("#left-pane").remove();
    await svg
      .transition()
      .duration(750)
      .call(
        zoom.transform,
        d3.zoomIdentity,
        d3.zoomTransform(svg.node()).invert([width / 2, mapHeight / 2])
      )
      .end();

    selection
      .selectChild('path')
      .transition()
      .duration(750)
      .style('transform', null);

    selection
      .selectAll('g')
      .transition()
      .duration(750)
      .style('opacity', 0)
      .remove();

    d3.select('#county-borders')
      .transition()
      .duration(750)
      .style('opacity', 0)
      .remove();

    const otherStates = states_g.filter(
      ({ properties: { name } }) => stateName !== name
    );
    otherStates.style('display', null).style('z-index', 10, 'important');

    d3.selectAll('#state-borders, #us-border').style('display', null);

    pageState.zoomedState = undefined;

    gb.call(brush.move, pageState.dateRange.map(xScale));
  }

  const filterCountyDataToInterval = async (stateId, sd, ed) => {
    const counties =
      pageState.countyData.get(stateId) || (await loadCovidData(stateId));
    pageState.countyData.set(stateId, counties);

    const intervalCounties = d3.filter(
      counties,
      (d) => d.fips.startsWith(stateId) && d.date >= sd && d.date <= ed
    );

    const allCountyValues = intervalCounties.sort(
      (a, b) => a.date.getTime() - b.date.getTime()
    );

    return topojson
      .feature(us, us.objects.counties)
      .features.filter(({ id }) => id.startsWith(stateId))
      .map((feature) => {
        const {
          properties: { name: countyName },
          id,
        } = feature;
        const values = [
          allCountyValues.find(({ county }) => county.includes(countyName)),
          allCountyValues.findLast(({ county }) => county.includes(countyName)),
        ];
        if (values[0] === undefined || values[1] === undefined) {
          return undefined;
        }

        const state = values[0].state;
        const cases = values[values.length - 1].cases - values[0].cases;
        const deaths = values[values.length - 1].deaths - values[0].deaths;
        return {
          ...feature,
          state,
          cases,
          deaths,
          casesPerCapita: cases / countiesPopulation[id],
          deathsPerCapita: deaths / countiesPopulation[id],
        };
      })
      .filter((feature) => feature !== undefined);
  };

  async function stateClicked(event, d) {
    event.stopPropagation();

    const marginWidth = mapWidth / 5;
    const marginHeight = mapHeight / 5;

    const {
      properties: { name: stateName },
      id: stateId,
      cases,
      deaths,
    } = d;

    const key = [stateId, startDate, endDate];
    const quantileData =
      pageState.countyData.get(key) ||
      (await filterCountyDataToInterval(stateId, startDate, endDate));
    pageState.countyData.set(key, quantileData);

    const choropleth = makeQuantileChoropleth(quantileData);

    if (
      pageState.zoomedState !== undefined &&
      pageState.zoomedState === stateId
    ) {
      return reset.call(this, event, d);
    }
    pageState.zoomedState = stateId;
    const { geometries } = us.objects.counties;
    const stateCounties = Object.assign({}, us.objects.counties, {
      geometries: geometries.filter(({ id }) => id.startsWith(stateId)),
    });
    const [[x0, y0], [x1, y1]] = path.bounds(d);

    states_g.transition().style('fill', null);
    pageState.counties_g = d3
      .select(this)
      .selectAll('g')
      .data(quantileData)
      .join('g')
      .attr('fill', (d) => choropleth(d))
      .attr('opacity', 0);
    pageState.counties_g.transition().duration(750).attr('opacity', 1);
    pageState.counties_g
      .append('path')
      .attr('d', path)
      .append('title')
      .text(({ properties: { name: county }, ...stats }) =>
        formatStats(county, stats)
      );
    d3.select(this)
      .append('path')
      .attr('id', 'county-borders')
      .attr('fill', 'none')
      .attr('stroke', () => borderColor(cases))
      .style('opacity', 0)
      .attr('stroke-linejoin', 'round')
      .attr('d', path(topojson.mesh(us, stateCounties, (a, b) => a !== b)));
    d3.select(this)
      .append('path')
      .attr('fill', 'none')
      .attr('stroke', () => borderColor(cases))
      .attr('stroke-linejoin', 'round')
      .attr(
        'd',
        path(
          topojson.mesh(
            us,
            us.objects.states,
            (a, b) =>
              a.properties.name === stateName || b.properties.name === stateName
          )
        )
      );
    d3.select('#county-borders')
      .transition()
      .duration(750)
      .style('opacity', 1, 'important');
    states_g
      .filter(({ properties: { name } }) => stateName !== name)
      .style('display', 'none');

    d3.selectAll('#state-borders, #us-border').style('display', 'none');

    const scaleX = (marginWidth - 10) / (x1 - x0),
      scaleY = (marginHeight - 10) / (y1 - y0);
    const scale = d3.min([scaleX, scaleY]);

    const transition = svg.transition().duration(750);
    transition.call(
      zoom.transform,
      d3.zoomIdentity
        .translate(width / 2, mapHeight / 2)
        .scale(
          d3.min([8, 0.9 / d3.max([(x1 - x0) / width, (y1 - y0) / mapHeight])])
        )
        .translate(-(x0 + x1) / 2, -(y0 + y1) / 2),
      d3.pointer(event, svg.node())
    );
  }

  function zoomed(event) {
    const { transform } = event;
    g.attr('transform', transform).attr('stroke-width', 1 / transform.k);
  }
}

async function showStateComparisons() {}

async function showConclusion() {}

async function showMandates() {
  const mandates = await d3.csv(
    'data/State-Level_Vaccine_Mandates_-_All_20240723.csv',
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
    .select('svg')
    .attr('viewBox', [0, 0, width, height])
    .attr('width', width)
    .attr('height', height);

  const dots = svg
    .selectAll('circle')
    .data(mandates)
    .join('circle')
    .attr('cx', ({ effective_date }) => xScale(effective_date))
    .attr('cy', height / 2)
    .attr('r', 2.5)
    .attr('fill', 'whitesmoke');

  dots
    .append('title')
    .text(({ state, effective_date }) => `${state} on ${effective_date}`);

  svg
    .append('g')
    .attr('transform', `translate(0,${height - marginBottom})`)
    .call(
      d3
        .axisBottom(xScale)
        .ticks(d3.timeMonth.every(1))
        .tickFormat((date) => {
          const month = date.getMonth(),
            year = date.getFullYear();
          const monthName = [
            year,
            'Feb',
            'Mar',
            'Apr',
            'May',
            'Jun',
            'Jul',
            'Aug',
            'Sep',
            'Oct',
            'Nov',
            'Dec',
          ];

          return monthName[month];
        })
    );

  const parseTime = d3.timeParse('%d-%b-%y');
  const timeFormat = d3.timeFormat('%d-%b-%y');

  //Skipping setting domains for sake of example
  const x = d3.scaleTime().range([0, 800]);
  const y = d3.scaleLinear().range([300, 0]);
  const type = d3.annotationCallout;

  const annotationGroup = svg
    .append('g')
    .attr('class', 'annotation-group')
    .attr('fill', 'white');

  dots.each(function (d, i) {
    d3.select(this)
      .on('click', function () {})
      .on('mouseover', function () {
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
                title: `${d3.timeFormat('%B %Y')(d.effective_date)}`,
                label: `${d.state}`,
              },
              data: d,
              className: 'show-bg',
              dy: -50,
              dx: 100,
            },
          ]);

        annotationGroup.call(makeAnnotations);
      })
      .on('mouseout', function () {
        annotationGroup.call(d3.annotation().annotations([]));
      });
  });
}

async function showGraphs() {
  const width = 960;
  const height = 810;
  const margin = { bottom: 20, left: 50, right: 5 };

  const svg = d3
    .select('.viewport svg')
    .attr('viewBox', [0, 0, width, height])
    .attr('width', width)
    .attr('height', height);

  svg.call(pleaseWait, width, height);

  const data = pageState.geoData || (await loadStatesData());
  pageState.geoData = data;

  const mandateData = pageState.mandateData || (await fetchMandateData());
  pageState.mandateData = mandateData;

  const {
    geoData: { us, states },
    mandateData: { mandates, restrictions },
    selectedStates,
  } = pageState;

  const geoPath = d3.geoPath();

  const selectedStateData = selectedStates
    .map((state) => states.filter((s) => s.state === state))
    .map((stateData) =>
      stateData.sort((a, b) => a.date.getTime() - b.date.getTime())
    )
    .map(runningDiff);

  const selectedStateMandates = selectedStates.map((state) =>
    d3
      .merge([
        mandates.filter((m) => m.state === state),
        restrictions.filter((m) => m.state === state),
      ])
      .map(({ effective_date: date, ...rest }) => ({ date, ...rest }))
      .sort((a, b) => a.date.getTime() - b.date.getTime())
  );

  const [minDate, maxDate] = d3.extent(
    d3.merge(selectedStateData.map((datum) => datum.map((d) => d.date)))
  );
  const [_minCases, maxCases] = d3.extent(
    d3.merge(selectedStateData.map((datum) => datum.map((d) => d.cases)))
  );
  const [_minDeaths, maxDeaths] = d3.extent(
    d3.merge(selectedStateData.map((datum) => datum.map((d) => d.deaths)))
  );

  const xScale = d3
    .scaleTime()
    .domain(pageState.zoomDateExtent || [minDate, maxDate])
    .range([margin.left, width - margin.right]);

  const graphHeight = height / 2 - 2 * margin.bottom;

  const yMax = [maxDeaths, maxCases];

  const yScales = (i) =>
    d3
      .scaleLinear()
      .domain([0, yMax[i]])
      .range([
        graphHeight + i * (graphHeight + margin.bottom),
        margin.bottom + i * graphHeight,
      ]);

  const mapWidth = 975,
    mapHeight = 610;

  const pane = d3
    .select('.pane .pane-interior')
    .selectChildren('svg')
    .data([0, 1])
    .join('svg')
    .attr('viewBox', [0, 0, mapWidth, mapHeight]);

  pane.html('');

  pane
    .on('mouseenter', function () {
      d3.select(this).style('width', '200%');
    })
    .on('mouseleave', function () {
      d3.select(this).style('width', null);
    });

  const g = pane.append('g');

  g.append('rect')
    .attr('x', 0)
    .attr('y', 0)
    .attr('width', mapWidth)
    .attr('height', mapHeight)
    .attr('fill', '#222222');

  const states_g = g
    .attr('cursor', 'pointer')
    .selectAll('g')
    .data(topojson.feature(us, us.objects.states).features)
    .join('g');

  const colors = ['#f4cf64', '#be2a3e'];

  g.each(function (d, i) {
    d3.select(this)
      .selectChildren('g')
      .attr('fill', ({ properties: { name } }) =>
        name === selectedStates[i] ? colors[i] : '#444444'
      )
      .on('click', function (_e, { properties: { name } }) {
        pageState.selectedStates[i] = name;
        showGraphs();
      });
  });

  states_g
    .append('path')
    .attr('d', geoPath)
    .append('title')
    .text(({ properties: { name } }) => name);

  states_g
    .append('path')
    .attr('d', geoPath(topojson.mesh(us, us.objects.states, (a, b) => a !== b)))
    .attr('fill', 'none')
    .attr('stroke', 'whitesmoke');

  states_g
    .append('path')
    .attr('d', geoPath(topojson.mesh(us, us.objects.nation)))
    .attr('stroke', 'whitesmoke')
    .attr('fill', 'none');

  svg.html('');

  const defs = svg.append('defs');

  defs
    .selectAll('clipPath')
    .data(selectedStateData)
    .join('clipPath')
    .attr('id', (_d, i) => `clip-path-${i}`)
    .append('rect')
    .attr('x', xScale(minDate))
    .attr('y', (d, i) => yScales(i).range()[1] + margin.left)
    .attr('width', width - margin.left - margin.right)
    .attr('height', (d, i) => {
      const [bottom, top] = yScales(i).range();
      return bottom - top + 2 * margin.bottom;
    });

  defs
    .append('filter')
    .attr('id', 'blur-effect')
    .append('feGaussianBlur')
    .attr('stdDeviation', 4);

  const zoomData = (data) => (
    (dateExtent = xScale.domain()),
    data.filter(
      (d) =>
        d.date.getTime() >= dateExtent[0].getTime() &&
        d.date.getTime() <= dateExtent[1].getTime()
    )
  );

  const deathsGraphs = svg
    .append('g')
    .selectChildren('g')
    .data(selectedStateData)
    .join('g');

  deathsGraphs.each(function (data, i) {
    d3.select(this)
      .selectChildren('circle')
      .data(zoomData(data))
      .join('circle')
      .attr('r', 2)
      .attr('fill', colors[i])
      .attr('cx', (d) => xScale(d.date))
      .attr('cy', (d) => yScales(0)(d.deaths));
  });

  const casesGraph = svg
    .append('g')
    .selectChildren('g')
    .data(selectedStateData)
    .join('g');

  casesGraph.each(function (data, i) {
    d3.select(this)
      .selectChildren('circle')
      .data(zoomData(data))
      .join('circle')
      .attr('r', 2)
      .attr('fill', colors[i])
      .attr('cx', (d) => xScale(d.date))
      .attr('cy', (d) => yScales(1)(d.cases));
  });

  const graphs = [deathsGraphs, casesGraph];

  const zoomedMandates = () =>
    selectedStateMandates.map((mandates) =>
      d3.group(
        zoomData(mandates),
        (m) => m.date,
        (m) => m.type
      )
    );

  const extractMandateHtml = (m) => m.vaccination_mandate_group;

  const extractRestrictionHtml = (m) => m.vaccination_prohibition_groups;

  const prepareAnnotations = (group) => ({});

  const defineAnnotations = () =>
    d3.merge(
      zoomedMandates().flatMap((grouped, s) =>
        Array.from(
          grouped.entries().map(([date, regulations], i) =>
            Array.from(
              regulations.entries().map(([type, regulation]) => ({
                note: {
                  label: Array.from(
                    d3.union(
                      type === 'mandate'
                        ? regulation.map(extractMandateHtml)
                        : regulation.map(extractRestrictionHtml)
                    )
                  ).join(', '),
                  bgPadding: 20,
                  title: `${type} in ${selectedStates[s]}`,
                },
                data: { date },
                className: s === 0 ? 'annotation-first' : 'annotation-second',
                dy: -100 - Math.round(Math.random() * grouped.size) * 30,
                dx: Math.min(
                  xScale(maxDate) - xScale(date) - 100,
                  Math.max(margin.left - xScale(date), -150 + i * 50)
                ),
                subject: {
                  radius: 5,
                  raduisPadding: 1,
                },
              }))
            )
          )
        )
      )
    );

  const makeAnnotations = () =>
    d3
      .annotation()
      .notePadding(10)
      .type(d3.annotationCalloutCircle)
      .accessors({
        x: (d) => xScale(d.date) + 10,
        y: (d) => yScales(1)(0),
      })
      .annotations(defineAnnotations());

  graphs.forEach(function (graph, i) {
    svg
      .append('g')
      .attr('id', `axis-bottom-${i}`)
      .attr('transform', `translate(0, ${yScales(i)(0) + 2})`)
      .call(d3.axisBottom(xScale));
    svg
      .append('g')
      .attr('transform', `translate(${margin.left}, 0)`)
      .call(d3.axisLeft(yScales(i)));
  });
  svg.append('g').attr('class', 'annotation-tip').call(makeAnnotations());

  const mouse_g = svg
    .append('g')
    .classed('mouse', true)
    .style('display', 'none')
    .style('pointer-events', 'none');
  mouse_g
    .append('rect')
    .style('pointer-events', 'none')
    .attr('width', 2)
    .attr('x', -1)
    .attr('y', yScales(0)(yMax[0]))
    .attr('height', yScales(1)(0) - yScales(0)(yMax[0]))
    .attr('fill', 'lightgray');

  const circles_g = mouse_g.selectAll('g').data(selectedStateData).join('g');

  circles_g.each(function (_d, j) {
    d3.select(this)
      .selectAll('circle')
      .data([0, 1])
      .join('circle')
      .datum(
        selectedStateData[j].map(({ date, deaths, cases }) => [
          { date, value: deaths },
          { date, value: cases },
        ])
      )
      .attr('r', 5)
      .attr('stroke', 'whitesmoke')
      .attr('fill', colors[j])
      .style('clip-path', (_d, i) => `url(#clip-path-${i})`);
    d3.select(this).selectAll('text').data([0, 1]).join('text');
  });

  svg.on('mouseover', function (mouse) {
    const [x_coord, _] = d3.pointer(mouse, svg.node());
    if (x_coord < margin.left) {
      return;
    }

    mouse_g.style('display', 'block');
  });

  svg.on('mousemove', function (mouse) {
    const [x_coord, _] = d3.pointer(mouse, svg.node());
    if (x_coord < margin.left) {
      return;
    }
    mouse_g.style('display', 'block');
    const pointerDate = xScale.invert(x_coord);

    mouse_g.select('rect').attr('x', x_coord);

    circles_g.each(function (_d, j) {
      const circles = d3.select(this).selectAll('circle');
      const data = circles.datum();
      const index = d3.minIndex(data, (d) =>
        Math.abs(d[0].date.getTime() - pointerDate.getTime())
      );
      const now = data[index];

      circles
        .attr('cx', x_coord)
        .attr('cy', (d, i) => yScales(i)(now[i].value));

      const texts = d3.select(this).selectAll('text');

      texts.each(function (_d, t) {
        d3.select(this)
          .attr('text-anchor', x_coord > width - 200 ? 'end' : 'start')
          .attr('stroke', 'whitesmoke')
          .attr('fill', 'whitesmoke')
          .attr('x', x_coord + (x_coord > width - 200 ? -5 : 5))
          .attr('y', (d) => yScales(d)(now[d].value) - 10)
          .text((d) =>
            d === 0 ? `Deaths: ${now[d].value}` : `Cases: ${now[d].value}`
          );
      });
    });
  });
  svg.on('mouseout', function () {
    mouse_g.style('display', 'none');
  });

  const brush_g = svg.append('g');

  const defaultSelection = null;

  const brush = d3
    .brushX()
    .extent([
      [margin.left, yScales(0).range()[1]],
      [width - margin.right, yScales(1).range()[0]],
    ])
    .on('brush', brushed)
    .on('start', brushStareted)
    .on('end', brushEnded);

  brush_g.call(brush).call(brush.move, defaultSelection);

  function brushed({ selection }) {
    if (selection) {
      console.log(selection);
    }
  }

  function brushStareted() {
    mouse_g.style('display', 'none');
  }

  function brushEnded({ selection }) {
    if (selection) {
      xScale.domain(
        (pageState.zoomDateExtent = [
          xScale.invert(selection[0]),
          xScale.invert(selection[1]),
        ])
      );
      updateGraphs();
      brush_g.call(brush.move, defaultSelection);
    }
  }

  svg.on('dblclick', function () {
    xScale.domain([minDate, maxDate]);
    pageState.zoomDateExtent = undefined;
    updateGraphs();
  });

  function updateGraphs() {
    deathsGraphs.each(function (data, i) {
      d3.select(this)
        .selectChildren('circle')
        .data(zoomData(data))
        .join('circle')
        .attr('r', 2)
        .attr('fill', colors[i])
        .attr('cx', (d) => xScale(d.date))
        .attr('cy', (d) => yScales(0)(d.deaths));
    });
    casesGraph.each(function (data, i) {
      d3.select(this)
        .selectChildren('circle')
        .data(zoomData(data))
        .join('circle')
        .attr('r', 2)
        .attr('fill', colors[i])
        .attr('cx', (d) => xScale(d.date))
        .attr('cy', (d) => yScales(1)(d.cases));
      graphs.forEach(function (graph, i) {
        svg
          .select(`#axis-bottom-${i}`)
          .attr('transform', `translate(0, ${yScales(i)(0) + 2})`)
          .call(d3.axisBottom(xScale));
      });
    });
    svg.select('.annotation-tip').call(makeAnnotations());
  }
}

const runningDiff = (series) => {
  const daily = Array.from(series);

  for (let i = 1; i < daily.length; i++) {
    daily[i] = {
      ...daily[i],
      cases: series[i].cases - series[i - 1].cases,
      deaths: series[i].deaths - series[i - 1].deaths,
    };
  }

  return daily;
};

function fetchNationalData() {
  return d3.csv('data/us.csv', (d) => ({
    ...d,
    date: new Date(d.date),
    cases: +d.cases,
    deaths: +d.deaths,
  }));
}

async function loadPopulationData(filename) {
  const populations = await d3.csv(
    filename,
    ({ fips, census_2020_pop, estimates_base_2020 }) => ({
      fips,
      population: +(census_2020_pop || estimates_base_2020),
    })
  );

  const map = {};
  populations.forEach(({ fips, population }) => {
    map[fips] = population;
  });

  return map;
}

function fetchStateData() {
  return d3.csv('data/us-states.csv', (d) => ({
    ...d,
    date: new Date(d.date),
    cases: +d.cases,
    deaths: +d.deaths,
  }));
}

function fetchCountyData(stateId) {
  return d3.csv(`data/preprocessed/us-counties-${stateId}.csv`, (d) => ({
    ...d,
    date: new Date(d.date),
    cases: +d.cases,
    deaths: +d.deaths,
  }));
}

function loadCovidData(forStateId) {
  if (forStateId) {
    return fetchCountyData(forStateId);
  }

  return Promise.all([fetchNationalData(), fetchStateData()]);
}

async function fetchMandateData() {
  const [mandates, restrictions] = await Promise.all([
    d3.csv('data/State-Level_Vaccine_Mandates_-_All_20240723.csv', (d) => ({
      type: 'mandate',
      ...d,
      date_signed: new Date(d.date_signed),
      effective_date: new Date(d.effective_date),
    })),
    d3.csv(
      'data/State-Level_Restrictions_on_Vaccine_Mandates___All_20240723.csv',
      (d) => ({
        type: 'restriction',
        ...d,
        date_signed: new Date(d.date_signed),
        effective_date: new Date(d.effective_date),
      })
    ),
  ]);

  return { mandates, restrictions };
}

async function loadStatesData() {
  const [us, [national, states], statesPopulation, countiesPopulation] =
    await Promise.all([
      d3.json('data/counties-albers-10m.json'),
      loadCovidData(),
      loadPopulationData('data/us-population-states.csv'),
      loadPopulationData('data/us-population-counties.csv'),
    ]);

  return {
    us,
    national,
    states,
    statesPopulation,
    countiesPopulation,
  };
}

async function showScatter() {
  const { states, statesPopulation: pop } = await loadStatesData();

  const width = 800,
    height = 450;
  const margin = { left: 10, right: 10, top: 10, bottom: 10 };

  const svg = d3.select('svg').attr('viewBox', [0, 0, width, height]);

  const compareDates = (a, b) => a.date.getTime() - b.date.getTime();
  const data = d3.map(
    d3.group(states, (d) => d.state).values(),
    function (state) {
      const first = d3.least(state, compareDates);
      const last = d3.greatest(state, compareDates);

      return {
        state: first.state,
        cases: (last.cases - first.cases) / pop[first.fips],
        deaths: (last.deaths - first.deaths) / pop[first.fips],
      };
    }
  );

  const xScale = d3
    .scaleLinear()
    .domain([0, d3.max(data, (d) => d.cases)])
    .range([margin.left, width - margin.right]);

  const yScale = d3
    .scaleLinear()
    .domain([0, d3.max(data, (d) => d.deaths)])
    .range([height - margin.bottom, margin.top]);

  const g = svg.selectAll('g').data(data).join('g');

  g.append('circle')
    .attr('fill', 'whitesmoke')
    .attr('stroke', 'red')
    .attr('cx', ({ cases }) => xScale(cases))
    .attr('cy', ({ deaths }) => yScale(deaths))
    .attr('r', 5);

  g.append('title').text(({ state }) => state);
}

window.onload = showScatter;
