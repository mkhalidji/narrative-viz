const pageState = {
  currentPage: 0,
  pages: [],
  zoomedState: undefined,
  counties_g: undefined,
  dateRange: undefined,
  selectedStates: ['California', 'Florida'],
  us: undefined,
  showGraphsData: undefined,
  geoData: undefined,
};

async function showMap() {
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
  svg
    .append('text')
    .attr('x', 20)
    .attr('y', 20)
    .attr('stroke', 'white')
    .attr('fill', 'white')
    .style('font-size', '14pt')
    .text('Loading data... please wait');

  const data = pageState.geoData || (await prepareGeoData());
  pageState.geoData = data;

  const { us, national, states, counties, mandates, restrictions } = data;

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
      };
    });
  };

  const filterCountyDataToInterval = (stateId, sd, ed) => {
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
        } = feature;
        console.log(countyName);
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
        };
      })
      .filter((feature) => feature !== undefined);
  };

  const casesColor = d3
    .scaleDiverging([0, 25000, 75000], ['#22763f', '#f4cf64', '#be2a3e'])
    .clamp(true);

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

  svg.on('click', reset);

  const path = d3.geoPath();

  const g = svg.append('g').call(zoom);

  const states_g = g
    .attr('cursor', 'pointer')
    // .attr("fill", "#4453")
    .attr('fill', 'whitesmoke')
    .selectAll('g')
    .data(filterStateDataToInterval(startDate, endDate))
    .join('g')
    .on('click', stateClicked);

  states_g.attr('fill', ({ deaths }) => {
    return casesColor(deaths);
  });

  states_g
    .append('path')
    .attr('d', path)
    .on('clicked', stateClicked)
    .append('title')
    .text(({ properties: { name: state }, cases, deaths }) => {
      return `${state}\nCases: ${cases}\nDeaths: ${deaths}`;
    });

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

  const defaultSelection = [xScale.range()[0], xScale.range()[1]];
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
        .attr('stroke', 'whitesmoke')
        .attr('text-anchor', x > width - 150 ? 'end' : 'start')
        .selectChildren('tspan')
        .data([date.toDateString(), `Cases: ${cases}`, `Deaths: ${deaths}`])
        .join('tspan')
        .attr('stroke', 'whitesmoke')
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

  function brushed({ selection }) {
    if (selection) {
      const [startDate, endDate] = (pageState.dateRange = selection.map(
        xScale.invert
      ));
      if (pageState.zoomedState === undefined) {
        states_g
          .data(filterStateDataToInterval(startDate, endDate))
          .attr('fill', ({ deaths }) => casesColor(deaths))
          .selectChild('path')
          .attr('d', path)
          .selectChild('title')
          .text(({ properties: { name: state }, cases, deaths }) => {
            return `${state}\nCases: ${cases}\nDeaths: ${deaths}`;
          });
        gb.select('title').text(
          `${startDate.toDateString()}-${endDate.toDateString()}`
        );
      } else {
        pageState.counties_g
          .data(
            filterCountyDataToInterval(
              pageState.zoomedState,
              startDate,
              endDate
            )
          )
          .attr('fill', ({ deaths }) => casesColor(deaths))
          .selectChild('path')
          .attr('d', path)
          .select('title')
          .text(({ properties: { name: county }, cases, deaths }) => {
            return `${county}\nCases: ${cases}\nDeaths: ${deaths}`;
          });
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
    console.log(stateName);
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

  function stateClicked(event, d) {
    event.stopPropagation();

    const marginWidth = mapWidth / 5;
    const marginHeight = mapHeight / 5;

    const {
      properties: { name: stateName },
      id: stateId,
      cases,
      deaths,
    } = d;
    console.log(stateName);
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
      .data(filterCountyDataToInterval(stateId, startDate, endDate))
      .join('g')
      .attr('fill', ({ deaths }) => casesColor(deaths))
      .attr('opacity', 0);
    pageState.counties_g.transition().duration(750).attr('opacity', 1);
    pageState.counties_g
      .append('path')
      .attr('d', path)
      .append('title')
      .text(({ properties: { name: county }, cases, deaths }) => {
        return `${county}\nCases: ${cases}\nDeaths: ${deaths}`;
      });
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

  const covidData =
    pageState.showGraphsData ||
    Object.groupBy(
      await d3.csv(
        'https://raw.githubusercontent.com/mkhalidji/covid-19-data/master/us-states.csv',
        (d) => ({
          ...d,
          date: new Date(d.date),
          cases: +d.cases,
          deaths: +d.deaths,
        })
      ),
      (d) => d.state
    );
  pageState.showGraphsData = covidData;

  const us = pageState.us || (await d3.json('data/counties-albers-10m.json'));
  pageState.us = us;

  const geoPath = d3.geoPath();

  const { selectedStates } = pageState;

  const data = selectedStates.map((state) =>
    runningDiff(
      covidData[state].sort((a, b) => a.date.getTime() - b.date.getTime())
    ).map((d) => [d.date, d.cases])
  );

  const [minDate, maxDate] = d3.extent(
    d3.merge(data.map((datum) => datum.map((d) => d[0])))
  );
  const [_minCases, maxCases] = d3.extent(
    d3.merge(data.map((datum) => datum.map((d) => d[1])))
  );

  const xScale = d3
    .scaleTime()
    .domain([minDate, maxDate])
    .range([margin.left, width - margin.right]);

  const graphHeight = height / 2 - 2 * margin.bottom;

  const casesScale = (i) =>
    d3
      .scaleLinear()
      .domain([0, maxCases])
      .range([
        graphHeight + 1 * (graphHeight + margin.bottom),
        margin.bottom + 1 * graphHeight,
      ]);

  // const areaGraph = (i) =>
  //   d3
  //     .area()
  //     .x((d) => xScale(d[0]))
  //     .y0(casesScale(i)(0))
  //     .y1((d) => casesScale(i)(d[1]));

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
        name === pageState.selectedStates[i] ? colors[i] : '#444444'
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

  const svg = d3
    .select('.viewport svg')
    .attr('viewBox', [0, 0, width, height])
    .attr('width', width)
    .attr('height', height);

  svg.html('');

  const defs = svg.append('defs');

  defs
    .selectAll('clipPath')
    .data(data)
    .join('clipPath')
    .attr('id', (_d, i) => `clip-path-${i}`)
    .append('rect')
    .attr('x', xScale(minDate))
    .attr('y', (d, i) => casesScale(i).range()[1] + margin.left)
    .attr('width', width - margin.left - margin.right)
    .attr('height', (d, i) => {
      const [bottom, top] = casesScale(i).range();
      return bottom - top + 2 * margin.bottom;
    });

  const graphs = svg.selectAll('g').data(data).join('g');

  // graphs
  //   .append('path')
  //   .attr('d', (d, i) => areaGraph(i)(d))
  //   .attr('fill', (_d, i) => colors[i])
  //   .attr('stroke', (_d, i) => colors[i])
  //   .attr('stroke-width', 2)
  //   .style('clip-path', (_d, i) => `url(#clip-path-${i})`);

  graphs.each(function (d, i) {
    d3.select(this)
      .selectAll('circle')
      .data(d)
      .join('circle')
      .attr('r', 2)
      .attr('fill', colors[i])
      .attr('cx', (d) => xScale(d[0]))
      .attr('cy', (d) => casesScale(i)(d[1]));
  });

  graphs.each(function (d, i) {
    svg
      .append('g')
      .attr('transform', `translate(0, ${casesScale(i)(0) + 2})`)
      .call(d3.axisBottom(xScale));
    svg
      .append('g')
      .attr('transform', `translate(${margin.left}, 0)`)
      .call(d3.axisLeft(casesScale(i)));
  });

  const mouse_g = svg
    .append('g')
    .classed('mouse', true)
    .style('display', 'none');
  mouse_g
    .append('rect')
    .attr('width', 2)
    .attr('x', -1)
    .attr('y', casesScale(0)(250000))
    .attr('height', casesScale(1)(0) - casesScale(0)(250000))
    .attr('fill', 'lightgray');
  mouse_g
    .selectAll('circle')
    .data(data)
    .join('circle')
    .attr('r', 5)
    .attr('stroke', 'whitesmoke')
    .attr('fill', (_d, i) => colors[i])
    .style('clip-path', (d, i) => `url(#clip-path-${i})`);
  mouse_g.selectAll('text').data(data).join('text');

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
    const data = mouse_g.selectAll('circle').data();
    const now = data
      .map((datum) =>
        d3.minIndex(datum, (d) =>
          Math.abs(d[0].getTime() - pointerDate.getTime())
        )
      )
      .map((index, i) => data[i][index]);

    mouse_g.select('rect').attr('x', x_coord);
    // mouse_g
    //   .selectAll('text')
    //   .text((_d, i) => `${now[i][0].toDateString()}, New cases: ${now[i][1]}`)
    //   .attr('stroke', 'whitesmoke')
    //   .attr('text-anchor', 'middle')
    //   .raise();

    mouse_g
      .selectAll('circle')
      .attr('cx', x_coord)
      .attr('cy', (d, i) => casesScale(i)(now[i][1]));

    mouse_g.selectAll('text').each(function (d, i) {
      d3.select(this)
        .attr('text-anchor', x_coord > width - 200 ? 'end' : 'start')
        .selectAll('tspan')
        .data([now[i][0].toDateString(), `Cases: ${now[i][1]}`])
        .join('tspan')
        .attr('stroke', 'whitesmoke')
        .attr('fill', 'whitesmoke')
        .attr('x', x_coord + (x_coord > width - 200 ? -5 : 5))
        .attr('y', (_d, j) => casesScale(i)(now[i][1]) + 20 * j - 30)
        .text((d) => d);
    });
  });
  svg.on('mouseout', function () {
    mouse_g.style('display', 'none');
  });
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
  return d3.csv(
    'https://raw.githubusercontent.com/nytimes/covid-19-data/master/us.csv',
    (d) => ({
      ...d,
      date: new Date(d.date),
      cases: +d.cases,
      deaths: +d.deaths,
    })
  );
}

function fetchStateData() {
  return d3.csv(
    'https://raw.githubusercontent.com/nytimes/covid-19-data/master/us-states.csv',
    (d) => ({
      ...d,
      date: new Date(d.date),
      cases: +d.cases,
      deaths: +d.deaths,
    })
  );
}

function fetchCountyData() {
  return d3.csv(
    'https://raw.githubusercontent.com/nytimes/covid-19-data/master/us-counties.csv',
    (d) => ({
      ...d,
      date: new Date(d.date),
      cases: +d.cases,
      deaths: +d.deaths,
    })
  );
}

function prepareCovidData() {
  return Promise.all([
    fetchNationalData(),
    fetchStateData(),
    fetchCountyData(),
  ]);
}

function prepareMandateData() {
  return Promise.all([
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
}

async function prepareGeoData() {
  const [us, [national, states, counties], [mandates, restrictions]] =
    await Promise.all([
      d3.json('data/counties-albers-10m.json'),
      prepareCovidData(),
      prepareMandateData(),
    ]);

  return { us, national, states, counties, mandates, restrictions };
}

function movingAverage(values, N) {
  let i = 0;
  let sum = 0;
  const means = new Float64Array(values.length).fill(NaN);
  for (let n = Math.min(N - 1, values.length); i < n; ++i) {
    sum += values[i];
  }
  for (let n = values.length; i < n; ++i) {
    sum += values[i];
    means[i] = sum / N;
    sum -= values[i - N + 1];
  }
  return means;
}

window.onload = showMap;
