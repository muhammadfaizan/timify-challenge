const { Room, Doctor, Consultation } = require('../db/index');
const debug = require('debug')('timify:controllers:consultations')
let m = require('moment');
const { extendMoment } = require('moment-range');
const mongoose = require('mongoose');
const RK = mongoose.Types.ObjectId;
const v = require('../services/index').validator;
const R = require('ramda');

const { TIME_FORMAT, DATE_FORMAT, DATE_TIME_FORMAT } = require('../services').constants;
m = extendMoment(m);
moment = m.utc


const cvrtMoment2Index = (momentIndex) => (momentIndex) % 7;
const findMiddleTime = (referenceTime, subjectTime) => {
    // case 1: subject begin time is in interval of reference time
    // case 2: subject end time is in interval of reference time
    // case 3: subject time overlaps from outer bounds to reference time
    // case 4: subject is limited to reference time
    // case 5: subject time lies on reference time
    // case 6: subject time never overlaps reference time


    if (!referenceTime || !subjectTime) {
        debug('null case');
        return null;
    }
    // case 8
    if (moment(subjectTime.begin).isSameOrAfter(referenceTime.end) ||
        moment(subjectTime.end).isSameOrBefore(referenceTime.begin)) {
        debug('case 8');
        return null
    }
    // case 2 & case 1
    if (moment(referenceTime.begin).isSameOrBefore(subjectTime.begin) &&
        moment(referenceTime.end).isSameOrAfter(subjectTime.end)) {
        debug('case 1 & 2')
        return {
            begin: new Date(subjectTime.begin),
            end: new Date(subjectTime.end)
        };
    }
    // case 3 & 9
    if (moment(referenceTime.begin).isSame(subjectTime.begin)) {
        debug('case 3 & 9')
        return {
            begin: new Date(referenceTime.begin),
            end: (moment(referenceTime.end).isSameOrBefore(subjectTime.end)) ? new Date(referenceTime.end) : new Date(subjectTime.end)
        }
    }
    // case 4 and 10
    if (moment(referenceTime.end).isSame(subjectTime.end)) {
        debug('case 4 & 10');
        return {
            begin: (moment(referenceTime.begin).isAfter(subjectTime.begin)) ? new Date(referenceTime.begin) : new Date(subjectTime.begin),
            end: new Date(referenceTime.end),
        }
    }

    // case 6
    if (moment(subjectTime.begin).isBetween(referenceTime.begin, referenceTime.end)) {
        debug('case 6')
        return {
            begin: new Date(subjectTime.begin),
            end: (moment(referenceTime.end).isSameOrBefore(subjectTime.end)) ? new Date(referenceTime.end) : new Date(subjectTime.end)
        }
    }
    // case 7
    if (moment(subjectTime.end).isBetween(referenceTime.begin, referenceTime.end)) {
        debug('case 7')
        return {
            begin: (moment(referenceTime.begin).isAfter(subjectTime.begin)) ? new Date(referenceTime.begin) : new Date(subjectTime.begin),
            end: new Date(subjectTime.end)
        }
    }
    debug('no case');
    return null;
}
const findAvailability = async (req, res, next) => {
    try {
        // const validator = v.object({
        //     begin: v.dateString,
        //     end: v.dateString,
        //     duration: v.numeric
        // });

        // debug(req.query);
        // validator(req.query);
        let payload = req.query;
        debug(payload)
        let mStartDate = moment(payload.begin, DATE_TIME_FORMAT)
        let mEndDate = moment(payload.end, DATE_TIME_FORMAT)
        if (mStartDate > mEndDate) {
            throw new Error('"begin" date must be earlier date than "end" date')
        }
        let weekDays = [];
        // let daysCount = mEndDate.diff(mStartDate, 'days');
        for (let i = 0, iterativeDate = mStartDate.clone();
            i < 7 && iterativeDate < mEndDate;
            i++) {
            weekDays.push(cvrtMoment2Index(iterativeDate.weekday()))
            iterativeDate.add(1, 'day');
        }
        if (weekDays.length < 7 && mEndDate.isAfter(mEndDate.clone().startOf('day'))) {
            weekDays.push(cvrtMoment2Index(mEndDate.weekday()))
        }

        /* 
         To check null value
         { $type: 10 }
        */
        let query = { $or: [] }
        // all the weekdays found
        // now mapping it to query
        // by $or
        query.$or = weekDays.map(wd => {
            let key = `times.${wd}`;
            let q = {};
            q[key] = { $ne: { $type: 10 } }
            return q;
        })

        let availableRooms = await Room.find(query);
        let availableDoctors = await Doctor.find(query);
        availableDoctors = availableDoctors.map(obj => obj.toObject())
        availableRooms = availableRooms.map(o => o.toObject());
        let setAvailableTime = (docSet) => {
            return docSet.map(doc => {
                if (!doc.availableTimes) {
                    doc.availableTimes = [];
                }
                let docItrtvDate = mStartDate.clone();
                // iterating over days to create exact same days for each day in interval
                while (docItrtvDate <= mEndDate) {

                    let dayIndex = cvrtMoment2Index(docItrtvDate.weekday());

                    if (!doc.times[dayIndex]) {
                        doc.availableTimes.push(null);
                    } else {
                        let begin = moment(`${docItrtvDate.format(DATE_FORMAT)} ${doc.times[dayIndex].begin}`, DATE_TIME_FORMAT).toDate();
                        let end = moment(`${docItrtvDate.format(DATE_FORMAT)} ${doc.times[dayIndex].end}`, DATE_TIME_FORMAT).toDate();
                        if (mStartDate.isSameOrAfter(end)) {
                            doc.availableTimes.push(null);
                        } else if (mEndDate.isSameOrBefore(end)) {
                            doc.availableTimes.push(null);
                        } else if (mStartDate.isAfter(begin)) {
                            begin = mStartDate.toDate();
                        } else if (mEndDate.isBefore(end)) {
                            end = mEndDate.toDate();
                        } else {
                            doc.availableTimes.push({
                                begin,
                                end
                            })
                        }
                    }
                    docItrtvDate.add(1, 'day');
                }
                return doc;
            });
        }
        availableDoctors = setAvailableTime(availableDoctors);
        availableRooms = setAvailableTime(availableRooms);
        let doctorAndRoomTimes = availableRooms.reduce((prev, currentRoom) => {
            return availableDoctors.map(doctor => {
                let DnR = {
                    room: currentRoom._id,
                    doctor: doctor._id,
                    times: []
                };
                doctor.availableTimes.forEach(doctorTime => {
                    currentRoom.availableTimes.forEach(roomTime => {
                        let commonTimeSpan = findMiddleTime(roomTime, doctorTime);
                        if (commonTimeSpan) {
                            DnR.times.push(commonTimeSpan);
                        }
                    });
                });
                return DnR;
            })
        }, [])

        // once data is ready and has all available time listed for doctor and room.
        // check for consultations on that day and modify that day room accordingly.

        doctorAndRoomTimes = await Promise.all(doctorAndRoomTimes.map(async (DnR) => {
            let consultationQueries = [];
            debug(DnR);
            try {
                DnR.times.forEach(time => {
                    consultationQueries.push({
                        $and: [
                            {
                                $or: [
                                    { doctorId: DnR.doctor },
                                    { roomId: DnR.room }
                                ]
                            }, {
                                $or: [
                                    {
                                        $and: [
                                            { begin: { $gte: time.begin } },
                                            { begin: { $lt: time.end } },
                                        ],
                                    }, {
                                        $and: [
                                            {
                                                $or: [
                                                    { doctor: DnR.doctor },
                                                    { room: DnR.room }
                                                ]
                                            },
                                            { end: { $gt: time.begin } },
                                            { end: { $lte: time.end } },
                                        ],
                                    }, {
                                        $or: [
                                            { doctor: DnR.doctor },
                                            { room: DnR.room }
                                        ],
                                        begin: time.startTime,
                                        end: time.endTime,
                                    }, {
                                        $or: [
                                            { doctor: DnR.doctor },
                                            { room: DnR.room }
                                        ],
                                        begin: { $lt: time.begin },
                                        end: { $gt: time.end },
                                    }
                                ],
                            }
                        ],

                    })
                })
            } catch (err) {
                debug(err);
            }

            DnR.consulations = await Promise.all(consultationQueries.map(q => Consultation.find(q, 'begin end')))
            return DnR;
        }));
        let timeSeparator = (time, consultations) => {
            let timeRanges = [m.range(time.begin, time.end)];
            consultations.forEach(con => {
                timeRanges.forEach((t, i) => {
                    let ranges = t.subtract(m.range(con.begin, con.end));
                    if (ranges[0] !== null) {
                        timeRanges.splice(i, 1, ...ranges)
                    }
                })

            })
            return timeRanges.map(t => {
                return {
                    begin: t.start.utc().toDate(),
                    end: t.end.utc().toDate()
                }
            })

        }
        doctorAndRoomTimes.forEach(DnR => {
            DnR.times.forEach((avbTime, i) => {
                DnR.finalTime = timeSeparator(avbTime, DnR.consulations[i]);
            });
        })
        // now everytime has a consultation array.



        res.send({
            doctorAndRoomTimes
        });
    } catch (err) {
        next(err);
    }
}

const createConsultation = async (req, res, next) => {
    try {
        let payload = [].concat(req.body);
        payload = payload.map(c => {
            c.begin = moment(c.begin, DATE_TIME_FORMAT).toDate();
            c.end = moment(c.end, DATE_TIME_FORMAT).toDate();
            return new Consultation(c);
        })
        let r = await Promise.all(payload.map(d => d.save()))
        // Consultation.collection.insertMany(payload);
        // let r = await Consultation.remove({});
        res.send(r);
    } catch (err) {
        next(err);
    }

}
const getAllConsultations = async (req, res, next) => {
    try {
        res.send(await Consultation.find({}));
    } catch (err) {
        next(err);
    }
}

module.exports = {
    findAvailability,
    createConsultation,
    getAllConsultations
}