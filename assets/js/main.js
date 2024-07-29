const state = {
  zoomedState: undefined,
};

async function showMap() {
  const mapWidth = 975;
  const mapHeight = 610;
  const mapMargin = { bottom: 20 };
  const chartMargin = { left: 100 };
  const chartHeight = 120;

  const width = mapWidth;
  const height = mapHeight + mapMargin.bottom + chartHeight;

  const svg = d3.select('svg').attr('viewBox', [0, 0, width, height]);
  svg
    .append('text')
    .attr('x', 20)
    .attr('y', 20)
    .attr('stroke', 'white')
    .style('font-size', '14pt')
    .text('Loading data... please wait');

  const data = await prepareGeoData();
  const { us, national, states, counties, mandates, restrictions } = data;

  const [startDate, endDate] = d3.extent(national, (d) => d.date);

  const filterDataToInterval = (sd, ed) => {
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

  const casesColor = d3
    .scaleDivergingPow([0, 25000, 75000], ['#22763f', '#f4cf64', '#be2a3e'])
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
    .data(filterDataToInterval(startDate, endDate))
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
      const [startDate, endDate] = selection.map(xScale.invert);
      states_g
        .data(filterDataToInterval(startDate, endDate))
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
    }
  }

  function brushended({ selection }) {
    if (!selection) {
      gb.call(brush.move, defaultSelection);
    }
  }

  let zoomedState = undefined;

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

    zoomedState = undefined;
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
    if (zoomedState !== undefined && zoomedState === stateName) {
      return reset.call(this, event, d);
    }
    zoomedState = stateName;
    const { geometries } = us.objects.counties;
    const stateCounties = Object.assign({}, us.objects.counties, {
      geometries: geometries.filter(({ id }) => id.startsWith(stateId)),
    });
    const [[x0, y0], [x1, y1]] = path.bounds(d);

    states_g.transition().style('fill', null);
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
      .transition()
      .duration(750)
      .style('display', 'none');

    d3.selectAll('#state-borders, #us-border')
      .transition()
      .duration(750)
      .style('display', 'none');

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
  const width = 975;
  const height = 610;

  const covidData = Object.groupBy(
    await d3.csv(
      'https://raw.githubusercontent.com/mkhalidji/covid-19-data/master/us-states.csv',
      (d) => ({
        ...d,
        date: new Date(d.date),
        cases: +d.cases,
        deaths: +d.deaths,
        rate: +d.deaths === 0 ? 0 : (+d.deaths / +d.cases) * 100,
      })
    ),
    (d) => d.state
  );

  const caCovidData = covidData['California'].map((d) => [d.date, d.rate]);

  const [minDate, maxDate] = d3.extent(caCovidData.map((d) => d[0]));

  const xScale = d3
    .scaleTime()
    .domain([minDate, maxDate])
    .range([5, width - 5]);

  const rateScale = d3
    .scaleLinear()
    .domain([0, 10])
    .range([height - 10, 10]);

  const lineGraph = d3.line(
    (d) => xScale(d[0]),
    (d) => rateScale(d[1])
  );

  const svg = d3
    .select('svg')
    .attr('viewBox', [0, 0, width, height])
    .attr('width', width)
    .attr('height', height);

  svg
    .append('path')
    .datum(caCovidData)
    .attr('d', lineGraph)
    .attr('fill', 'none')
    .attr('stroke', 'whitesmoke')
    .attr('stroke-width', 2);

  const mouse_g = svg
    .append('g')
    .classed('mouse', true)
    .style('display', 'none');
  mouse_g
    .append('rect')
    .attr('width', 2)
    .attr('x', -1)
    .attr('height', height - 20)
    .attr('fill', 'lightgray');
  mouse_g.append('circle').attr('r', 5).attr('stroke', 'whitesmoke');
  mouse_g.append('text');

  svg.on('mouseover', function (mouse) {
    mouse_g.style('display', 'block');
  });

  svg.on('mousemove', function (mouse) {
    const [x_cord, y_cord] = d3.pointer(mouse);
    const ratio = x_cord / (width - 20);
    const now = new Date(
      minDate.getTime() +
        Math.round(ratio * (maxDate.getTime() - minDate.getTime()))
    );
    const index = d3.maxIndex(
      caCovidData.map((d) => d[0].getTime()).filter((d) => d < now.getTime())
    );
    if (index < 0) {
      mouse_g.style('display', 'none');
      return;
    }
    const datum = caCovidData[index];
    const rate = datum[1];
    mouse_g.attr(
      'transform',
      `translate(${xScale(datum[0])},${rateScale(10)})`
    );
    mouse_g
      .select('text')
      .text(`${now.toDateString()}, Mortality: ${rate.toFixed(2)}%`)
      .attr('stroke', 'whitesmoke')
      .attr('text-anchor', 'middle');

    mouse_g.select('circle').attr('cy', rateScale(rate) - 10);
  });
  svg.on('mouseout', function (mouse) {
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

window.onload = showMap;
