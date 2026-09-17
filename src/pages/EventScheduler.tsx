// @ts-nocheck
// Ported from the lvbranding-events scheduler. The source app is JavaScript;
// this directive keeps the migration behavior-preserving while it is typed incrementally.
import { useState, useMemo, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { format, parse } from 'date-fns';
import { 
  Calendar, Clock, User, Mail, CheckCircle2, ArrowLeft, 
  XCircle, Shield, Table, Check, Users, History, Settings, 
  PlusCircle, Trash2, Edit, Share2, Star, ChevronDown,
  MapPin, Palette, Download, ExternalLink, UploadCloud, ImageIcon, Copy
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useOrg } from '@/hooks/useOrg';
import AppShell from '@/components/layout/AppShell';
import Header from '@/components/layout/Header';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

// --- Helper Functions ---
const convertTo24Hour = (time12h) => {
    if (!time12h || (!time12h.includes('AM') && !time12h.includes('PM'))) return time12h;
    const [time, modifier] = time12h.split(' ');
    let [hours, minutes] = time.split(':');
    if (hours === '12') hours = '00';
    if (modifier === 'PM') hours = parseInt(hours, 10) + 12;
    return `${String(hours).padStart(2, '0')}:${minutes}`;
};

const convertTo12Hour = (time24h) => {
    if (!time24h || time24h.includes('AM') || time24h.includes('PM')) return time24h;
    const [hours, minutes] = time24h.split(':');
    const hour = parseInt(hours, 10);
    const ampm = hour >= 12 ? 'PM' : 'AM';
    let displayHour = hour % 12;
    if (displayHour === 0) displayHour = 12;
    return `${displayHour}:${minutes} ${ampm}`;
};

const buildEventTimeSlots = (ranges = [], durationMinutes = 5) => {
    const slots = [];
    ranges.forEach(range => {
        const [start, end] = range.split('-');
        if (!start || !end) return;
        const [startHour, startMinute] = start.split(':').map(Number);
        const [endHour, endMinute] = end.split(':').map(Number);
        const startTotal = startHour * 60 + startMinute;
        const endTotal = endHour * 60 + endMinute;
        for (let total = startTotal; total + durationMinutes <= endTotal; total += durationMinutes) {
            const hour = Math.floor(total / 60);
            const minute = String(total % 60).padStart(2, '0');
            const ampm = hour >= 12 ? 'PM' : 'AM';
            const displayHour = hour % 12 || 12;
            slots.push(`${displayHour}:${minute} ${ampm}`);
        }
    });
    return slots;
};

const mapEventRow = (row) => ({
    id: row.id,
    orgId: row.org_id,
    name: row.name,
    location: row.location,
    placement: row.placement,
    themeColor: row.theme_color,
    dates: row.dates || [],
    timeSlots: row.time_slots || [],
    slotDurationMinutes: row.slot_duration_minutes || 5,
    logoUrl: row.logo_url || '',
    confirmationRedirectUrl: row.confirmation_redirect_url || '',
    isFeatured: row.is_featured,
    isActive: row.is_active,
});

const mapBookingRow = (row) => ({
    id: row.id,
    orgId: row.org_id,
    eventId: row.event_id,
    name: row.guest_name,
    email: row.guest_email,
    date: row.booking_date,
    time: String(row.slot_time).slice(0, 5),
    checkedIn: row.checked_in,
    eventName: row.event_schedule_events?.name || row.eventName || '',
});

const mapBlockedSlotRow = (row) => ({
    id: row.id,
    orgId: row.org_id,
    eventId: row.event_id,
    date: row.booking_date,
    time: String(row.slot_time).slice(0, 5),
});

// --- Main Application Component ---
export default function EventScheduler({ adminMode = false }) {
  const { org, loading: orgLoading } = useOrg();
  const { eventId: publicEventId } = useParams();
  const [view, setView] = useState(adminMode ? 'admin' : 'booking');
  const [lastBooking, setLastBooking] = useState(null);
  const [selectedDate, setSelectedDate] = useState(undefined);
  const [selectedTime, setSelectedTime] = useState(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [bookingError, setBookingError] = useState('');
  const [allBookings, setAllBookings] = useState([]);
  const [allBlockedSlots, setAllBlockedSlots] = useState([]);
  const [events, setEvents] = useState([]);
  const [activeEvent, setActiveEvent] = useState(null);
  const [editingEvent, setEditingEvent] = useState(null);
  const [editingBooking, setEditingBooking] = useState(null);
  const [collapsedLists, setCollapsedLists] = useState({});
  const [eventsLoading, setEventsLoading] = useState(true);
  const [dataError, setDataError] = useState('');
  const [bookingPending, setBookingPending] = useState(false);
  const [availabilityVersion, setAvailabilityVersion] = useState(0);
  const [adminRefreshVersion, setAdminRefreshVersion] = useState(0);
  const [eventFilter, setEventFilter] = useState('all');
  const [shareMessage, setShareMessage] = useState('');

  // Default theme color if not set
  const themeColor = activeEvent?.themeColor || '#f97316'; 

  // --- Scoped font lifecycle ---
  useEffect(() => {
    if (adminMode) return undefined;
    const link = document.createElement('link');
    link.href = 'https://fonts.googleapis.com/css2?family=Fira+Sans:wght@300;400;500;600;700&display=swap';
    link.rel = 'stylesheet';
    document.head.appendChild(link);
    const previousFontFamily = document.body.style.fontFamily;
    document.body.style.fontFamily = "'Fira Sans', sans-serif";

    return () => {
      link.remove();
      document.body.style.fontFamily = previousFontFamily;
    };
  }, [adminMode]);

  // --- Supabase events and authenticated admin data ---
  useEffect(() => {
    if (adminMode && orgLoading) return;
    let cancelled = false;
    let channel;

    const selectActiveEvent = (eventRows) => {
      const eventIdFromUrl = publicEventId || new URLSearchParams(window.location.search).get('event');
      setActiveEvent((previous) => {
        const requested = eventIdFromUrl && eventRows.find(event => event.id === eventIdFromUrl);
        const retained = previous && eventRows.find(event => event.id === previous.id);
        return requested || retained || eventRows.find(event => event.isFeatured) || eventRows[0] || null;
      });
    };

    const load = async () => {
      if (adminMode && !org?.id) {
        if (!cancelled) {
          setEvents([]);
          setAllBookings([]);
          setDataError('No organization is available for this account.');
          setEventsLoading(false);
        }
        return;
      }

      setEventsLoading(true);
      setDataError('');
      let eventsQuery = supabase
        .from('event_schedule_events')
        .select('id, org_id, name, location, placement, theme_color, dates, time_slots, slot_duration_minutes, logo_url, confirmation_redirect_url, is_featured, is_active')
        .order('is_featured', { ascending: false })
        .order('created_at', { ascending: false });
      eventsQuery = adminMode
        ? eventsQuery.eq('org_id', org.id)
        : eventsQuery.eq('is_active', true);
      if (!adminMode && publicEventId) eventsQuery = eventsQuery.eq('id', publicEventId);

      const eventsResult = await eventsQuery;
      if (eventsResult.error) {
        console.error('Unable to load scheduled events:', eventsResult.error);
        if (!cancelled) {
          setDataError('Events could not be loaded. Please refresh and try again.');
          setEventsLoading(false);
        }
        return;
      }

      const mappedEvents = (eventsResult.data || []).map(mapEventRow);
      if (!cancelled) {
        setEvents(mappedEvents);
        selectActiveEvent(mappedEvents);
      }

      if (adminMode) {
        const [bookingsResult, blockedSlotsResult] = await Promise.all([
          supabase
            .from('event_schedule_bookings')
            .select('id, org_id, event_id, guest_name, guest_email, booking_date, slot_time, checked_in, event_schedule_events(name)')
            .eq('org_id', org.id)
            .order('booking_date', { ascending: true })
            .order('slot_time', { ascending: true }),
          supabase
            .from('event_schedule_blocked_slots')
            .select('id, org_id, event_id, booking_date, slot_time')
            .eq('org_id', org.id)
            .order('booking_date', { ascending: true })
            .order('slot_time', { ascending: true }),
        ]);
        if (bookingsResult.error) {
          console.error('Unable to load event bookings:', bookingsResult.error);
          if (!cancelled) setDataError('Some booking information could not be loaded. Please refresh and try again.');
        } else if (!cancelled) {
          setAllBookings((bookingsResult.data || []).map(mapBookingRow));
        }
        if (blockedSlotsResult.error) {
          console.error('Unable to load blocked event slots:', blockedSlotsResult.error);
          if (!cancelled) setDataError('Some blocked availability could not be loaded. Please refresh and try again.');
        } else if (!cancelled) {
          setAllBlockedSlots((blockedSlotsResult.data || []).map(mapBlockedSlotRow));
        }
      }
      if (!cancelled) setEventsLoading(false);
    };

    void load();
    if (adminMode && org?.id) {
      channel = supabase
        .channel(`event-scheduler-admin-${org.id}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'event_schedule_events', filter: `org_id=eq.${org.id}` }, () => void load())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'event_schedule_bookings', filter: `org_id=eq.${org.id}` }, () => void load())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'event_schedule_blocked_slots', filter: `org_id=eq.${org.id}` }, () => void load())
        .subscribe();
    }

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [adminMode, org?.id, orgLoading, adminRefreshVersion, publicEventId]);

  // Public callers receive occupied slots only—never guest names or emails.
  useEffect(() => {
    if (adminMode || !activeEvent?.id) return;
    let cancelled = false;
    const loadAvailability = async () => {
      const { data, error } = await supabase.rpc('event_schedule_booked_slots', { p_event_id: activeEvent.id });
      if (error) {
        console.error('Unable to load event availability:', error);
        if (!cancelled) setDataError('Availability could not be loaded. Please refresh and try again.');
        return;
      }
      if (!cancelled) {
        setAllBookings((data || []).map(slot => ({
          id: `${slot.booking_date}-${slot.slot_time}`,
          eventId: activeEvent.id,
          eventName: activeEvent.name,
          date: slot.booking_date,
          time: String(slot.slot_time).slice(0, 5),
          checkedIn: false,
        })));
      }
    };
    void loadAvailability();
    const interval = window.setInterval(loadAvailability, 15000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, [adminMode, activeEvent?.id, availabilityVersion]);

  const eventDays = useMemo(() => {
    if (!activeEvent || !activeEvent.dates) return [];
    return activeEvent.dates.map(d => parse(d, 'yyyy-MM-dd', new Date()));
  }, [activeEvent]);

  const timeSlots = useMemo(() => {
    if (!selectedDate || !activeEvent || !activeEvent.timeSlots) return [];
    return buildEventTimeSlots(activeEvent.timeSlots, activeEvent.slotDurationMinutes);
  }, [selectedDate, activeEvent]);

  const bookedSlotsForSelectedDate = useMemo(() => {
    if (!selectedDate || !activeEvent) return [];
    const dateKey = format(selectedDate, 'yyyy-MM-dd');
    return allBookings
      .filter(booking => booking.date === dateKey && booking.eventId === activeEvent.id)
      .map(booking => booking.time);
  }, [selectedDate, allBookings, activeEvent]);
  
  const emailsForCurrentEvent = useMemo(() => {
    if (!activeEvent) return [];
    return allBookings
        .filter(booking => booking.eventId === activeEvent.id && booking.email)
        .map(booking => booking.email.toLowerCase());
  }, [allBookings, activeEvent]);

  const guestAttendance = useMemo(() => {
    const attendance = {};
    allBookings.forEach(booking => {
        const guestEmail = booking.email?.toLowerCase();
        if (!guestEmail) return;
        const eventIdentifier = booking.eventName || booking.date;
        if (!attendance[guestEmail]) attendance[guestEmail] = new Set();
        attendance[guestEmail].add(eventIdentifier);
    });
    const finalCounts = {};
    for (const guestEmail in attendance) {
        finalCounts[guestEmail] = attendance[guestEmail].size;
    }
    return finalCounts;
  }, [allBookings]);

  const groupedBookings = useMemo(() => {
    const groups = allBookings.reduce((acc, booking) => {
        const date = booking.date;
        if (!acc[date]) acc[date] = [];
        acc[date].push(booking);
        return acc;
    }, {});
    for (const date in groups) {
        groups[date].sort((a, b) => {
            const timeA = a.time.includes('M') ? convertTo24Hour(a.time) : a.time;
            const timeB = b.time.includes('M') ? convertTo24Hour(b.time) : b.time;
            return new Date(`${a.date}T${timeA}`) - new Date(`${b.date}T${timeB}`);
        });
    }
    return Object.keys(groups).sort().reduce((obj, key) => { 
        obj[key] = groups[key]; 
        return obj;
    }, {});
  }, [allBookings]);

  const handleDateSelect = (date) => {
    if (selectedDate?.getTime() !== date.getTime()) setSelectedTime(null);
    setSelectedDate(date);
    setBookingError('');
  };
  
  const handleTimeSelect = (time) => {
    setSelectedTime(time);
    setBookingError('');
  };

  const handleBookingSubmit = async (e) => {
    e.preventDefault();
    setBookingError('');
    if (emailsForCurrentEvent.includes(email.toLowerCase())) {
        setBookingError("This email has already been used to book a slot for this event.");
        return;
    }
    if (!selectedDate || !selectedTime || !name || !email) {
      setBookingError("Please fill all fields before confirming.");
      return;
    }
    setBookingPending(true);
    try {
      const { data: bookingId, error } = await supabase.rpc('book_event_schedule_slot', {
        p_event_id: activeEvent.id,
        p_guest_name: name,
        p_guest_email: email,
        p_booking_date: format(selectedDate, 'yyyy-MM-dd'),
        p_slot_time: convertTo24Hour(selectedTime),
      });
      if (error) throw error;

      const confirmation = await supabase.functions.invoke('event-schedule-confirmation', {
        body: { booking_id: bookingId },
      });
      setLastBooking({
        name,
        email,
        selectedDate,
        selectedTime,
        confirmationSent: !confirmation.error && confirmation.data?.sent !== false,
      });
      setAvailabilityVersion(version => version + 1);
      setView('confirmation');
    } catch (error) {
      console.error('Error creating booking:', error);
      const message = `${error?.message || ''} ${error?.details || ''}`;
      if (message.includes('EMAIL_ALREADY_BOOKED')) {
        setBookingError('This email has already been used to book a slot for this event.');
      } else if (message.includes('SLOT_UNAVAILABLE')) {
        setBookingError('That time was just booked. Please choose another available slot.');
        setAvailabilityVersion(version => version + 1);
      } else {
        setBookingError('Could not save booking. Please try again.');
      }
    } finally {
      setBookingPending(false);
    }
  };
  
  const handleCheckIn = async (bookingId, currentStatus) => {
    const { error } = await supabase
      .from('event_schedule_bookings')
      .update({ checked_in: !currentStatus })
      .eq('id', bookingId);
    if (error) setDataError('The check-in status could not be updated.');
    else setAdminRefreshVersion(version => version + 1);
  };

  const handleSaveEvent = async (eventData) => {
    if (!org?.id) return;
    const eventFields = 'id, org_id, name, location, placement, theme_color, dates, time_slots, slot_duration_minutes, logo_url, confirmation_redirect_url, is_featured, is_active';
    const row = {
      name: eventData.name,
      location: eventData.location,
      placement: eventData.placement,
      theme_color: eventData.themeColor,
      dates: eventData.dates,
      time_slots: eventData.timeSlots,
      slot_duration_minutes: eventData.slotDurationMinutes,
      logo_url: eventData.logoUrl || null,
      confirmation_redirect_url: eventData.confirmationRedirectUrl || null,
      is_active: eventData.isActive !== false,
    };
    const result = editingEvent?.id
      ? await supabase.from('event_schedule_events').update(row).eq('id', editingEvent.id).select(eventFields).single()
      : await supabase.from('event_schedule_events').insert({ ...row, org_id: org.id, is_featured: false }).select(eventFields).single();
    if (result.error) {
      console.error('Unable to save event:', result.error);
      setDataError('The event could not be saved.');
      return;
    }
    setEditingEvent(mapEventRow(result.data));
    setShareMessage('Event saved. You can now manage blocked times below.');
    window.setTimeout(() => setShareMessage(''), 3000);
    setAdminRefreshVersion(version => version + 1);
  };

  const handleDeleteEvent = async (eventId) => {
    if (window.confirm("Are you sure you want to delete this event? This cannot be undone.")) {
        const { error } = await supabase.from('event_schedule_events').delete().eq('id', eventId);
        if (error) setDataError('The event could not be deleted. Owner or admin access is required.');
        else setAdminRefreshVersion(version => version + 1);
    }
  };

  const handleSetFeatured = async (eventIdToFeature) => {
    const { error } = await supabase.rpc('set_event_schedule_featured', { p_event_id: eventIdToFeature });
    if (error) setDataError('The featured event could not be updated.');
    else setAdminRefreshVersion(version => version + 1);
  };

  const handleToggleBlockedSlot = async (eventId, date, time, shouldBlock) => {
    setDataError('');
    const { error } = await supabase.rpc('set_event_schedule_slot_blocked', {
      p_event_id: eventId,
      p_booking_date: date,
      p_slot_time: convertTo24Hour(time),
      p_blocked: shouldBlock,
    });
    if (error) {
      const message = `${error.message || ''} ${error.details || ''}`;
      setDataError(message.includes('SLOT_ALREADY_BOOKED')
        ? 'That time already has a guest booking and cannot be blocked.'
        : 'The blocked availability could not be updated.');
      return false;
    }
    setAdminRefreshVersion(version => version + 1);
    return true;
  };

  const handleUpdateBooking = async (bookingId, updatedData) => {
    const { error } = await supabase
      .from('event_schedule_bookings')
      .update({
        guest_name: updatedData.name,
        guest_email: updatedData.email.trim().toLowerCase(),
        slot_time: convertTo24Hour(updatedData.time),
      })
      .eq('id', bookingId);
    if (error) {
      console.error('Unable to update booking:', error);
      setDataError('The booking could not be updated.');
      return;
    }
    setEditingBooking(null);
    setAdminRefreshVersion(version => version + 1);
  };

  const handleDeleteBooking = async (bookingId) => {
    if (window.confirm("Are you sure you want to delete this booking? This action is permanent.")) {
        const { error } = await supabase.from('event_schedule_bookings').delete().eq('id', bookingId);
        if (error) setDataError('The booking could not be deleted. Owner or admin access is required.');
        else setAdminRefreshVersion(version => version + 1);
    }
  };

  const handleDownloadCsv = () => {
    const headers = "Date,Time,Name,Email,Event Name,Status,Past Events Count\n";
    const rows = allBookings.map(booking => {
      const pastCount = guestAttendance[booking.email?.toLowerCase()] || 0;
      const status = booking.checkedIn ? 'Checked In' : 'Registered';
      // Escape commas in strings
      const safeName = `"${booking.name?.replace(/"/g, '""') || ''}"`;
      const safeEvent = `"${booking.eventName?.replace(/"/g, '""') || ''}"`;
      return `${booking.date},${convertTo12Hour(booking.time)},${safeName},${booking.email},${safeEvent},${status},${pastCount}`;
    }).join('\n');

    const csvContent = "data:text/csv;charset=utf-8," + headers + rows;
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", "bookings_export.csv");
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const publicEventUrl = (eventId) => `${window.location.origin}/events/${eventId}`;

  const handleShareEvent = async (eventId) => {
    const url = publicEventUrl(eventId);
    try {
      await navigator.clipboard.writeText(url);
      setShareMessage('Public event link copied to clipboard.');
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = url;
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
      setShareMessage('Public event link copied to clipboard.');
    }
    window.setTimeout(() => setShareMessage(''), 3000);
  };

  const toggleList = (date) => {
    setCollapsedLists(prev => ({...prev, [date]: !prev[date]}));
  };

  const isBookingDisabled = bookingPending || !selectedDate || !selectedTime || !name || !email;

  // --- Main View Router ---
  let currentView;
  if (view === 'confirmation') {
    currentView = (
      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl p-8 text-center animate-fade-in">
        <CheckCircle2 className="w-16 h-16 text-green-500 mx-auto mb-4" />
        <h1 className="text-2xl font-bold text-gray-800 mb-2">Appointment Confirmed!</h1>
        <p className="text-gray-600 mb-6">
          {lastBooking?.confirmationSent
            ? `A confirmation email has been sent to ${lastBooking.email}.`
            : `Your appointment is saved. Email confirmation to ${lastBooking?.email} may be delayed.`}
        </p>
        <div className="bg-gray-50 rounded-lg p-4 text-left space-y-3">
          <p className="flex items-center"><Calendar className="w-4 h-4 mr-3 text-gray-500" /><strong>Date:</strong><span className="ml-auto text-gray-700">{lastBooking && format(lastBooking.selectedDate, 'PPP')}</span></p>
          <p className="flex items-center"><Clock className="w-4 h-4 mr-3 text-gray-500" /><strong>Time:</strong><span className="ml-auto text-gray-700">{lastBooking?.selectedTime}</span></p>
          <p className="flex items-center"><User className="w-4 h-4 mr-3 text-gray-500" /><strong>Name:</strong><span className="ml-auto text-gray-700">{lastBooking?.name}</span></p>
        </div>
        <a
            href={activeEvent?.confirmationRedirectUrl || 'https://www.lvbranding.com'}
            style={{ backgroundColor: themeColor }}
            className="w-full mt-8 text-white py-3 rounded-lg font-semibold hover:brightness-110 transition-all duration-300 flex items-center justify-center shadow-lg"
        >
          Continue
        </a>
      </div>
    );
  } else if (view === 'admin' && adminMode) {
    const checkedInCount = allBookings.filter(b => b.checkedIn).length;
    const filteredEvents = eventFilter === 'all'
      ? events
      : events.filter(event => eventFilter === 'active' ? event.isActive : !event.isActive);
    currentView = (
        <div className="w-full max-w-6xl mx-auto animate-fade-in space-y-6">
            {shareMessage && (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700" role="status">
                {shareMessage}
              </div>
            )}

            {editingEvent ? (
                <EventForm
                  event={editingEvent}
                  orgId={org?.id}
                  bookings={allBookings.filter(booking => booking.eventId === editingEvent.id)}
                  blockedSlots={allBlockedSlots.filter(slot => slot.eventId === editingEvent.id)}
                  onToggleBlockedSlot={handleToggleBlockedSlot}
                  onSave={handleSaveEvent}
                  onCancel={() => setEditingEvent(null)}
                />
            ) : editingBooking ? (
                <BookingEditForm booking={editingBooking} onSave={handleUpdateBooking} onCancel={() => setEditingBooking(null)} />
            ) : (
                <div className="space-y-10">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="rounded-xl border border-border bg-card p-5">
                        <p className="text-xs font-medium text-muted-foreground">Events</p>
                        <p className="mt-1 text-3xl font-semibold text-foreground">{events.length}</p>
                      </div>
                      <div className="rounded-xl border border-border bg-card p-5">
                        <p className="text-xs font-medium text-muted-foreground">Total bookings</p>
                        <p className="mt-1 text-3xl font-semibold text-foreground">{allBookings.length}</p>
                      </div>
                      <div className="rounded-xl border border-border bg-card p-5">
                        <p className="text-xs font-medium text-muted-foreground">Checked in</p>
                        <p className="mt-1 text-3xl font-semibold text-emerald-600">{checkedInCount}</p>
                      </div>
                    </div>

                    <section className="space-y-4">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <div className="flex items-center gap-2">
                          {['all', 'active', 'inactive'].map(filter => (
                            <button
                              key={filter}
                              onClick={() => setEventFilter(filter)}
                              className={`px-3 py-1 rounded-full text-xs font-medium border transition-colors ${eventFilter === filter ? 'bg-primary text-primary-foreground border-primary' : 'border-border text-muted-foreground hover:text-foreground'}`}
                            >
                              {filter.charAt(0).toUpperCase() + filter.slice(1)}
                            </button>
                          ))}
                        </div>
                      </div>

                      {eventsLoading ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                          {[1, 2, 3].map(item => <Skeleton key={item} className="h-64 rounded-xl" />)}
                        </div>
                      ) : filteredEvents.length === 0 ? (
                        <div className="rounded-xl border border-dashed border-border py-16 text-center">
                          <Calendar className="w-10 h-10 text-muted-foreground/40 mx-auto mb-3" />
                          <p className="font-semibold text-foreground">No {eventFilter === 'all' ? '' : `${eventFilter} `}events yet</p>
                          <p className="text-sm text-muted-foreground mt-1">Create an event to start accepting appointment bookings.</p>
                          <Button className="mt-4 gap-1.5" onClick={() => setEditingEvent({ themeColor: '#f97316', isActive: true })}>
                            <PlusCircle size={14} /> Create Event
                          </Button>
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                          {filteredEvents.map(event => {
                            const eventBookings = allBookings.filter(booking => booking.eventId === event.id);
                            const eventCheckedIn = eventBookings.filter(booking => booking.checkedIn).length;
                            return (
                              <article key={event.id} className="bg-card border border-border rounded-xl p-5 space-y-4 hover:shadow-md hover:border-primary/20 transition-all">
                                <button type="button" className="w-full text-left" onClick={() => setEditingEvent(event)}>
                                  <div className="flex items-start justify-between gap-3">
                                    <div className="flex items-center gap-3 min-w-0">
                                      {event.logoUrl ? (
                                        <img src={event.logoUrl} alt="" className="w-12 h-12 rounded-lg object-contain border border-border bg-white shrink-0" />
                                      ) : (
                                        <div className="w-12 h-12 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: event.themeColor || '#f97316' }}>
                                          <Calendar size={20} className="text-white" />
                                        </div>
                                      )}
                                      <div className="min-w-0">
                                        <h3 className="text-sm font-semibold text-foreground truncate flex items-center gap-1.5">
                                          {event.isFeatured && <Star size={13} className="text-amber-500 fill-amber-500" />}
                                          {event.name}
                                        </h3>
                                        <p className="text-xs text-muted-foreground truncate mt-1">{event.location}{event.placement ? ` · ${event.placement}` : ''}</p>
                                      </div>
                                    </div>
                                    <Badge variant="outline" className={event.isActive ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-500'}>
                                      {event.isActive ? 'Active' : 'Inactive'}
                                    </Badge>
                                  </div>
                                </button>

                                <div className="text-xs text-muted-foreground space-y-1">
                                  <p>{event.dates.length ? event.dates.map(date => format(new Date(`${date}T00:00:00`), 'MMM d, yyyy')).join(' · ') : 'No dates configured'}</p>
                                  <p>{eventBookings.length} bookings · {eventCheckedIn} checked in · {event.slotDurationMinutes}-minute slots</p>
                                </div>

                                <div className="flex items-center gap-1.5 pt-3 border-t border-border/60">
                                  <Button size="sm" variant="outline" className="h-8 flex-1 gap-1" onClick={() => setEditingEvent(event)}>
                                    <Edit size={12} /> Edit
                                  </Button>
                                  <Button size="sm" variant="outline" className="h-8 flex-1 gap-1" disabled={!event.isActive} onClick={() => handleShareEvent(event.id)}>
                                    <Copy size={12} /> Share
                                  </Button>
                                  <Button size="icon" variant="outline" className="h-8 w-8" disabled={!event.isActive} asChild={event.isActive}>
                                    {event.isActive ? <a href={publicEventUrl(event.id)} target="_blank" rel="noopener noreferrer" aria-label={`Open ${event.name} public booking page`}><ExternalLink size={13} /></a> : <span><ExternalLink size={13} /></span>}
                                  </Button>
                                  <Button size="icon" variant="ghost" className="h-8 w-8 text-amber-600" disabled={event.isFeatured || !event.isActive} onClick={() => handleSetFeatured(event.id)} aria-label={`Feature ${event.name}`}>
                                    <Star size={14} />
                                  </Button>
                                  <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive" onClick={() => handleDeleteEvent(event.id)} aria-label={`Delete ${event.name}`}>
                                    <Trash2 size={14} />
                                  </Button>
                                </div>
                              </article>
                            );
                          })}
                        </div>
                      )}
                    </section>

                    <div>
                        <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center"><Users className="w-5 h-5 mr-2 text-green-500"/> Guest Check-in</h2>
                        {Object.keys(groupedBookings).length === 0 && <p className="text-gray-400 italic text-center py-10">No bookings yet.</p>}
                        {Object.keys(groupedBookings).map(date => (
                            <div key={date} className="mb-4">
                                <button onClick={() => toggleList(date)} className="w-full text-left flex justify-between items-center p-4 bg-gray-50 border border-gray-100 rounded-2xl shadow-sm hover:bg-white transition-all group">
                                    <span className="font-bold text-gray-700">{format(new Date(date.replace(/-/g, '/')), 'EEEE, MMMM d, yyyy')}</span>
                                    <div className="flex items-center">
                                        <span className="mr-3 px-2 py-0.5 bg-gray-200 text-gray-500 text-xs rounded-full font-bold">{groupedBookings[date].length}</span>
                                        <ChevronDown className={`w-5 h-5 text-gray-400 group-hover:text-blue-500 transition-transform ${collapsedLists[date] ? '' : 'rotate-180'}`} />
                                    </div>
                                </button>
                                {!collapsedLists[date] && (
                                    <div className="overflow-x-auto mt-2 animate-fade-in bg-white border border-gray-100 rounded-2xl shadow-sm">
                                        <table className="min-w-full">
                                            <thead>
                                                <tr className="bg-gray-50/50">
                                                    <th className="py-3 px-4 text-left text-xs font-bold text-gray-400 uppercase tracking-widest">Time</th>
                                                    <th className="py-3 px-4 text-left text-xs font-bold text-gray-400 uppercase tracking-widest">Guest</th>
                                                    <th className="py-3 px-4 text-left text-xs font-bold text-gray-400 uppercase tracking-widest">Event</th>
                                                    <th className="py-3 px-4 text-center text-xs font-bold text-gray-400 uppercase tracking-widest">Attendance</th>
                                                    <th className="py-3 px-4 text-center text-xs font-bold text-gray-400 uppercase tracking-widest">Status</th>
                                                    <th className="py-3 px-4 text-center text-xs font-bold text-gray-400 uppercase tracking-widest">Actions</th>
                                                </tr>
                                            </thead>
                                            <tbody className="divide-y divide-gray-50">
                                                {groupedBookings[date].map(booking => (
                                                    <tr key={booking.id} className="hover:bg-blue-50/30 transition-colors group">
                                                        <td className="py-3 px-4 text-sm text-gray-700 font-bold whitespace-nowrap">{convertTo12Hour(booking.time)}</td>
                                                        <td className="py-3 px-4 text-sm text-gray-700">
                                                            <div className="font-bold text-gray-900">{booking.name}</div>
                                                            <div className="text-[10px] text-gray-400 font-medium tracking-tight truncate max-w-[150px]">{booking.email}</div>
                                                        </td>
                                                        <td className="py-3 px-4 text-xs font-semibold text-gray-600 whitespace-nowrap">{booking.eventName}</td>
                                                        <td className="py-3 px-4 text-center">
                                                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-black bg-blue-50 text-blue-600">
                                                                <History className="w-3 h-3 mr-1"/> {guestAttendance[booking.email?.toLowerCase()] || 0}
                                                            </span>
                                                        </td>
                                                        <td className="py-3 px-4 text-center">
                                                            <button 
                                                                onClick={() => handleCheckIn(booking.id, booking.checkedIn)}
                                                                className={`inline-flex items-center px-4 py-1.5 rounded-xl text-[10px] font-black tracking-widest uppercase transition-all shadow-sm ${booking.checkedIn ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-green-50 text-green-600 hover:bg-green-100'}`}
                                                            >
                                                                {booking.checkedIn ? 'Undo' : 'Check In'}
                                                            </button>
                                                        </td>
                                                        <td className="py-3 px-4 text-center whitespace-nowrap">
                                                            <div className="flex items-center justify-center opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                                                <button onClick={() => setEditingBooking(booking)} className="text-gray-400 hover:text-blue-600 mr-3"><Edit className="w-4 h-4"/></button>
                                                                <button onClick={() => handleDeleteBooking(booking.id)} className="text-gray-400 hover:text-red-600"><Trash2 className="w-4 h-4"/></button>
                                                            </div>
                                                        </td>
                                                    </tr>
                                                ))}
                                            </tbody>
                                        </table>
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                </div>
            )}
        </div>
    );
  } else {
    // --- Public Booking View ---
    currentView = (
        <div className="w-full max-w-4xl mx-auto py-6">
            {!eventsLoading && <div className="text-center mb-8 px-4">
                <img 
                    src={activeEvent?.logoUrl || "https://static.wixstatic.com/media/ff471f_17e0b28d4dfb46cca22a04f89dc40f66~mv2.png/v1/fill/w_829,h_518,al_c,lg_1,q_90,enc_auto/The_grand_Pairie_Logo.png"} 
                    alt={activeEvent ? `${activeEvent.name} Logo` : "Event Logo"} 
                    className="mx-auto h-20 sm:h-28 w-auto object-contain drop-shadow-sm" 
                    onError={(e) => { e.target.src = "https://static.wixstatic.com/media/ff471f_17e0b28d4dfb46cca22a04f89dc40f66~mv2.png/v1/fill/w_829,h_518,al_c,lg_1,q_90,enc_auto/The_grand_Pairie_Logo.png"; }}
                />
            </div>}
            {eventsLoading ? (
                <div className="bg-white rounded-[3rem] shadow-2xl p-20 text-center mx-4 border border-gray-50" role="status">
                    <div className="w-14 h-14 rounded-full border-4 border-gray-100 border-t-orange-500 animate-spin mx-auto" />
                    <p className="text-gray-400 mt-6 font-bold">Loading event schedule…</p>
                </div>
            ) : activeEvent ? (
                <div className="bg-white rounded-3xl shadow-2xl overflow-hidden border border-gray-100 mx-2">
                    <div className="text-center py-8 px-6 text-white relative overflow-hidden" style={{ backgroundColor: themeColor }}>
                        <div className="absolute top-0 left-0 w-full h-full opacity-20 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-white/30 to-transparent pointer-events-none"></div>
                        <h1 className="text-xl sm:text-3xl font-extrabold tracking-tight leading-tight drop-shadow-sm uppercase">{activeEvent.name}</h1>
                        <div className="mt-3 flex flex-wrap items-center justify-center gap-2 text-xs sm:text-sm font-medium opacity-90">
                            <a 
                                href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(activeEvent.location)}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex items-center px-3 py-1 bg-black/10 rounded-full backdrop-blur-md hover:bg-black/20 transition-colors cursor-pointer group"
                            >
                                <MapPin className="w-3 h-3 mr-1 group-hover:scale-110 transition-transform" /> {activeEvent.location}
                            </a>
                            {activeEvent.placement && (
                                <span className="flex items-center px-3 py-1 bg-white/20 rounded-full backdrop-blur-md">
                                    {activeEvent.placement}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="p-6 sm:p-10 md:p-14">
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
                            <div>
                                <h2 className="text-2xl font-black text-gray-900 mb-8 flex items-center tracking-tight">
                                    <span className="w-9 h-9 rounded-2xl flex items-center justify-center text-white mr-4 text-base shadow-lg shadow-black/10" style={{ backgroundColor: themeColor }}>1</span>
                                    Select Date
                                </h2>
                                <div className="space-y-4">
                                    {eventDays.map((day) => {
                                        const isSelected = selectedDate?.getTime() === day.getTime();
                                        return (
                                            <button 
                                                key={day.toString()} 
                                                onClick={() => handleDateSelect(day)} 
                                                className={`w-full text-left p-6 rounded-2xl border-2 transition-all duration-300 flex items-center justify-between ${isSelected ? 'border-transparent shadow-2xl scale-[1.02] text-white' : 'bg-gray-50/50 border-gray-100 hover:border-blue-200 hover:bg-white text-gray-700'}`}
                                                style={isSelected ? { backgroundColor: themeColor } : {}}
                                            >
                                                <div className="font-black text-xl tracking-tight">{format(day, 'EEEE, MMM d')}</div>
                                                {isSelected ? <CheckCircle2 className="w-7 h-7" /> : <div className="w-7 h-7 rounded-full border-2 border-gray-200"></div>}
                                            </button>
                                        );
                                    })}
                                </div>

                                {selectedDate && (
                                    <div className="mt-12 animate-fade-in">
                                        <h2 className="text-2xl font-black text-gray-900 mb-8 flex items-center tracking-tight">
                                            <span className="w-9 h-9 rounded-2xl flex items-center justify-center text-white mr-4 text-base shadow-lg shadow-black/10" style={{ backgroundColor: themeColor }}>2</span>
                                            Pick a Time
                                        </h2>
                                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-3">
                                            {timeSlots.map((time) => {
                                                const time24h = convertTo24Hour(time);
                                                const isBooked = bookedSlotsForSelectedDate.includes(time) || bookedSlotsForSelectedDate.includes(time24h);
                                                const isSelected = selectedTime === time;
                                                return (
                                                    <button 
                                                        key={time} 
                                                        onClick={() => handleTimeSelect(time)} 
                                                        disabled={isBooked} 
                                                        className={`py-3.5 rounded-2xl text-[11px] font-black tracking-widest uppercase transition-all duration-300 border-2 ${isBooked ? 'bg-gray-50 text-gray-200 border-transparent cursor-not-allowed line-through' : isSelected ? 'text-white border-transparent shadow-xl transform scale-110' : 'bg-white text-gray-700 border-gray-100 hover:border-gray-300'}`}
                                                        style={isSelected ? { backgroundColor: themeColor } : {}}
                                                    >
                                                        {time}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        {timeSlots.length > 0 && timeSlots.length === bookedSlotsForSelectedDate.length && (
                                            <div className="mt-6 p-4 bg-red-50 rounded-2xl border border-red-100 text-center">
                                                <p className="text-red-600 font-bold text-sm tracking-tight">This day is fully booked! Try another date.</p>
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="lg:border-l-2 lg:pl-12 border-gray-50 flex flex-col">
                                <div className={`transition-all duration-500 ${selectedTime ? 'opacity-100 transform translate-y-0' : 'opacity-30 pointer-events-none translate-y-6'}`}>
                                    <h2 className="text-2xl font-black text-gray-900 mb-8 flex items-center tracking-tight">
                                        <span className="w-9 h-9 rounded-2xl flex items-center justify-center text-white mr-4 text-base shadow-lg shadow-black/10" style={{ backgroundColor: themeColor }}>3</span>
                                        Register Now
                                    </h2>
                                    <form onSubmit={handleBookingSubmit} className="space-y-6">
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-1">Guest Name</label>
                                            <input type="text" value={name} onChange={(e) => setName(e.target.value)} className="w-full p-5 bg-gray-50 border-transparent rounded-2xl font-bold text-gray-800 placeholder-gray-300 focus:bg-white focus:ring-4 transition-all" placeholder="Enter full name" required style={{ '--tw-ring-color': themeColor + '22' }} />
                                        </div>
                                        <div className="space-y-2">
                                            <label className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] ml-1">Email Address</label>
                                            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="w-full p-5 bg-gray-50 border-transparent rounded-2xl font-bold text-gray-800 placeholder-gray-300 focus:bg-white focus:ring-4 transition-all" placeholder="name@email.com" required style={{ '--tw-ring-color': themeColor + '22' }} />
                                        </div>
                                        {bookingError && (
                                            <div className="flex items-center text-red-600 bg-red-50 p-5 rounded-2xl border border-red-100 animate-shake">
                                                <XCircle className="w-5 h-5 mr-3 flex-shrink-0" />
                                                <p className="text-sm font-bold tracking-tight">{bookingError}</p>
                                            </div>
                                        )}
                                        <button 
                                            type="submit" 
                                            disabled={isBookingDisabled} 
                                            aria-busy={bookingPending}
                                            className="w-full text-white py-6 rounded-2xl font-black text-xl tracking-tighter uppercase hover:brightness-110 shadow-2xl transition-all duration-300 disabled:bg-gray-100 disabled:text-gray-300 disabled:shadow-none transform hover:-translate-y-1 active:translate-y-0"
                                            style={{ backgroundColor: themeColor }}
                                        >
                                            {bookingPending ? 'Reserving…' : 'Confirm Appointment'}
                                        </button>
                                    </form>
                                </div>
                                {!selectedDate && <div className="flex-grow flex flex-col items-center justify-center text-center text-gray-300 p-8 space-y-4">
                                    <div className="w-20 h-20 rounded-3xl bg-gray-50 flex items-center justify-center"><Calendar className="w-8 h-8 opacity-20" /></div>
                                    <p className="font-bold tracking-tight">Select a date above to begin your registration</p>
                                </div>}
                                {selectedDate && !selectedTime && <div className="flex-grow flex flex-col items-center justify-center text-center text-gray-300 p-8 space-y-4 animate-pulse">
                                    <div className="w-20 h-20 rounded-3xl bg-gray-50 flex items-center justify-center"><Clock className="w-8 h-8 opacity-20" /></div>
                                    <p className="font-bold tracking-tight">Now pick an available time slot</p>
                                </div>}
                            </div>
                        </div>
                    </div>
                </div>
            ) : (
                <div className="bg-white rounded-[3rem] shadow-2xl p-20 text-center mx-4 border border-gray-50">
                    <div className="w-24 h-24 bg-gray-50 rounded-full flex items-center justify-center mx-auto mb-8 shadow-inner">
                        <Calendar className="w-10 h-10 text-gray-200" />
                    </div>
                    <h1 className="text-3xl font-black text-gray-900 tracking-tighter uppercase">{dataError ? 'Schedule unavailable' : 'No Live Events'}</h1>
                    <p className="text-gray-400 mt-4 max-w-sm mx-auto font-medium text-lg leading-relaxed">
                        {dataError || 'The event portal is currently closed. Please check back with us soon for new dates!'}
                    </p>
                </div>
            )}
        </div>
    );
  }

  if (adminMode) {
    const adminTitle = editingEvent
      ? (editingEvent.id ? `Edit ${editingEvent.name}` : 'New Scheduled Event')
      : editingBooking
        ? 'Edit Booking'
        : 'Event Scheduling';

    return (
      <AppShell>
        <Header
          title={adminTitle}
          subtitle={editingEvent ? 'Event details, branding, availability, and publishing' : 'Create events, share booking links, and manage guest check-ins'}
          actions={
            <div className="flex items-center gap-2 flex-wrap">
              {(editingEvent || editingBooking) && (
                <Button variant="outline" size="sm" onClick={() => { setEditingEvent(null); setEditingBooking(null); }} className="gap-1.5">
                  <ArrowLeft size={14} /> All Events
                </Button>
              )}
              {!editingEvent && !editingBooking && (
                <>
                  <Button variant="outline" size="sm" onClick={handleDownloadCsv} className="gap-1.5">
                    <Download size={14} /> Export
                  </Button>
                  <Button size="sm" onClick={() => setEditingEvent({ themeColor: '#f97316', isActive: true })} className="gap-1.5">
                    <PlusCircle size={14} /> New Event
                  </Button>
                </>
              )}
            </div>
          }
        />
        <div className="p-3 sm:p-6">
          {dataError && (
            <div className="max-w-6xl mx-auto mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700" role="alert">
              {dataError}
            </div>
          )}
          {currentView}
        </div>
        <style dangerouslySetInnerHTML={{ __html: `
          .animate-fade-in { animation: fadeIn 0.4s ease-out forwards; }
          @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
        `}} />
      </AppShell>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-[#fafafa] text-gray-900 font-fira overflow-x-hidden selection:bg-blue-100 selection:text-blue-900">
        <header className="fixed top-8 right-8 z-[100]">
            <a
                href="/events/admin"
                aria-label="Open event scheduling administration"
                className="p-4 bg-white/70 backdrop-blur-xl rounded-[2rem] shadow-2xl border border-white hover:scale-110 transition-all active:scale-90 group"
            >
                <Shield className="h-6 w-6 text-gray-300 group-hover:text-blue-500 transition-colors" />
            </a>
        </header>
        {dataError && activeEvent && (
            <div className="fixed top-4 left-1/2 -translate-x-1/2 z-[110] max-w-lg rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 shadow-lg" role="alert">
                {dataError}
            </div>
        )}
        <main className="flex-grow flex items-center justify-center p-4">
            {currentView}
        </main>
        <footer className="text-center py-10 px-4">
            <p className="text-[10px] font-black text-gray-300 uppercase tracking-[0.4em] mb-2">Developed With Love by</p>
            <a href="https://www.lvbranding.com" target="_blank" rel="noopener noreferrer" className="text-xs font-black text-gray-500 hover:text-black transition-colors underline decoration-gray-200 underline-offset-8">LV Branding</a>
        </footer>
        <style dangerouslySetInnerHTML={{ __html: `
            .font-fira { font-family: 'Fira Sans', sans-serif; }
            .animate-fade-in { animation: fadeIn 0.4s ease-out forwards; }
            .animate-shake { animation: shake 0.5s cubic-bezier(.36,.07,.19,.97) both; }
            @keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
            @keyframes shake { 10%, 90% { transform: translate3d(-1px, 0, 0); } 20%, 80% { transform: translate3d(2px, 0, 0); } 30%, 50%, 70% { transform: translate3d(-4px, 0, 0); } 40%, 60% { transform: translate3d(4px, 0, 0); } }
        `}} />
    </div>
  );
}

// --- Event Form Component ---
const EventForm = ({ event, orgId, bookings = [], blockedSlots = [], onToggleBlockedSlot, onSave, onCancel }) => {
    const [name, setName] = useState(event.name || '');
    const [location, setLocation] = useState(event.location || '');
    const [placement, setPlacement] = useState(event.placement || '');
    const [themeColor, setThemeColor] = useState(event.themeColor || '#f97316');
    const [dates, setDates] = useState(event.dates ? event.dates.join(', ') : '');
    const [slotDurationMinutes, setSlotDurationMinutes] = useState(event.slotDurationMinutes || 5);
    const [logoUrl, setLogoUrl] = useState(event.logoUrl || '');
    const [confirmationRedirectUrl, setConfirmationRedirectUrl] = useState(event.confirmationRedirectUrl || '');
    const [isActive, setIsActive] = useState(event.isActive !== false);
    const [uploadingLogo, setUploadingLogo] = useState(false);
    const [assetId] = useState(() => event.id || crypto.randomUUID());
    const logoInputRef = useRef(null);
    
    const formatTimeSlotsForDisplay = (slots) => {
        if (!slots) return '';
        return slots.map(slot => {
            const parts = slot.split('-');
            if (parts.length !== 2) return slot;
            const [start, end] = parts;
            const start12 = convertTo12Hour(start).replace(':00', '');
            const end12 = convertTo12Hour(end).replace(':00', '');
            return `${start12}-${end12}`;
        }).join(', ');
    };

    const [timeSlots, setTimeSlots] = useState(formatTimeSlotsForDisplay(event.timeSlots));
    const [formError, setFormError] = useState('');

    const handleLogoUpload = async (file) => {
        setFormError('');
        if (!orgId) {
            setFormError('Your organization could not be identified. Refresh and try again.');
            return;
        }
        const allowedTypes = {
            'image/png': 'png',
            'image/jpeg': 'jpg',
            'image/webp': 'webp',
        };
        const extension = allowedTypes[file.type];
        if (!extension) {
            setFormError('Upload a PNG, JPG, or WebP image.');
            return;
        }
        if (file.size > 5 * 1024 * 1024) {
            setFormError('Logo files must be 5 MB or smaller.');
            return;
        }

        setUploadingLogo(true);
        try {
            const path = `${orgId}/${assetId}/logo-${Date.now()}.${extension}`;
            const { error } = await supabase.storage
                .from('event-schedule-assets')
                .upload(path, file, { contentType: file.type, upsert: false });
            if (error) throw error;
            const { data } = supabase.storage.from('event-schedule-assets').getPublicUrl(path);
            setLogoUrl(data.publicUrl);
        } catch (error) {
            console.error('Unable to upload event logo:', error);
            setFormError('The logo could not be uploaded. Please try again.');
        } finally {
            setUploadingLogo(false);
            if (logoInputRef.current) logoInputRef.current.value = '';
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        setFormError('');
        try {
            let normalizedRedirectUrl = '';
            if (confirmationRedirectUrl.trim()) {
                normalizedRedirectUrl = /^https:\/\//i.test(confirmationRedirectUrl.trim())
                    ? confirmationRedirectUrl.trim()
                    : `https://${confirmationRedirectUrl.trim()}`;
                const parsedRedirect = new URL(normalizedRedirectUrl);
                if (parsedRedirect.protocol !== 'https:' || !parsedRedirect.hostname) {
                    throw new Error('Confirmation destination must be a valid HTTPS link.');
                }
                normalizedRedirectUrl = parsedRedirect.toString();
            }

            // Robust parsing to handle various inputs (e.g. 10AM, 10:00AM, 10 AM)
            const formattedTimeSlots = timeSlots.split(',').map(t => {
                const parts = t.trim().split('-');
                if (parts.length !== 2) throw new Error(`Format error: ${t}`);
                
                const [start, end] = parts;
                const normalize = (val) => val.trim().replace(/\s/g, '').toUpperCase();
                
                let start24, end24;
                
                // Try format like 10AM
                start24 = parse(normalize(start), 'ha', new Date());
                end24 = parse(normalize(end), 'ha', new Date());

                if (isNaN(start24.getTime()) || isNaN(end24.getTime())) {
                    // Try format like 10:30AM
                    start24 = parse(normalize(start), 'h:mma', new Date());
                    end24 = parse(normalize(end), 'h:mma', new Date());
                    if (isNaN(start24.getTime()) || isNaN(end24.getTime())) {
                        throw new Error(`Time value: "${t}". Use "10AM-2PM" or "10:30AM-2:15PM".`);
                    }
                }

                return `${format(start24, 'HH:mm')}-${format(end24, 'HH:mm')}`;
            });

            onSave({
                name,
                location,
                placement,
                themeColor,
                dates: dates.split(',').map(d => d.trim()),
                timeSlots: formattedTimeSlots,
                slotDurationMinutes,
                logoUrl,
                confirmationRedirectUrl: normalizedRedirectUrl,
                isActive,
            });
        } catch (error) {
            setFormError(error.message);
        }
    };

    return (
        <div className="bg-gray-50/50 p-8 rounded-[2rem] border-2 border-gray-100 animate-fade-in shadow-inner">
            <h2 className="text-2xl font-black mb-8 tracking-tighter uppercase text-gray-800">{event.id ? 'Edit Event' : 'Create Event'}</h2>
            <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-6">
                    <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Event Name</label>
                        <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full p-4 bg-white border-2 border-gray-50 rounded-2xl font-bold focus:ring-4 focus:border-blue-500 transition-all" required />
                    </div>
                    <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Geography / City</label>
                        <input type="text" value={location} onChange={e => setLocation(e.target.value)} className="w-full p-4 bg-white border-2 border-gray-50 rounded-2xl font-bold focus:ring-4 focus:border-blue-500 transition-all" placeholder="e.g. Austin, TX" required />
                    </div>
                    <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Specific Placement</label>
                        <input type="text" value={placement} onChange={e => setPlacement(e.target.value)} className="w-full p-4 bg-white border-2 border-gray-50 rounded-2xl font-bold focus:ring-4 focus:border-blue-500 transition-all" placeholder="e.g. Hall C, Booth 500" />
                    </div>
                    <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2 flex items-center"><Palette className="w-3 h-3 mr-1" /> Brand Identity Color</label>
                        <div className="flex gap-3">
                            <input type="color" value={themeColor} onChange={e => setThemeColor(e.target.value)} className="w-16 h-14 p-1 bg-white border-2 border-gray-50 rounded-2xl cursor-pointer" />
                            <input type="text" value={themeColor} onChange={e => setThemeColor(e.target.value)} className="flex-grow p-4 bg-white border-2 border-gray-50 rounded-2xl font-mono font-bold uppercase" />
                        </div>
                    </div>
                </div>
                <div className="space-y-6">
                    <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Event Logo</label>
                        <input
                            ref={logoInputRef}
                            type="file"
                            accept="image/png,image/jpeg,image/webp"
                            className="sr-only"
                            onChange={event => event.target.files?.[0] && void handleLogoUpload(event.target.files[0])}
                        />
                        <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-white p-4">
                            {logoUrl ? (
                                <div className="flex items-center gap-4">
                                    <img src={logoUrl} alt="Event logo preview" className="h-20 w-28 rounded-xl border border-gray-100 bg-white object-contain p-2" />
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-bold text-gray-800">Logo ready</p>
                                        <p className="text-xs text-gray-400 mt-1">PNG, JPG, or WebP · up to 5 MB</p>
                                        <div className="flex gap-2 mt-3">
                                            <button type="button" onClick={() => logoInputRef.current?.click()} disabled={uploadingLogo} className="text-xs font-bold text-blue-600 hover:text-blue-800 disabled:opacity-50">Replace</button>
                                            <button type="button" onClick={() => setLogoUrl('')} disabled={uploadingLogo} className="text-xs font-bold text-red-500 hover:text-red-700 disabled:opacity-50">Remove</button>
                                        </div>
                                    </div>
                                </div>
                            ) : (
                                <button type="button" onClick={() => logoInputRef.current?.click()} disabled={uploadingLogo} className="w-full py-4 flex flex-col items-center justify-center text-center disabled:opacity-50">
                                    {uploadingLogo ? <UploadCloud className="w-8 h-8 text-blue-500 animate-pulse" /> : <ImageIcon className="w-8 h-8 text-gray-300" />}
                                    <span className="mt-2 text-sm font-bold text-gray-700">{uploadingLogo ? 'Uploading logo…' : 'Choose logo file'}</span>
                                    <span className="mt-1 text-xs text-gray-400">PNG, JPG, or WebP · up to 5 MB</span>
                                </button>
                            )}
                        </div>
                    </div>
                    <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Activation Dates (YYYY-MM-DD)</label>
                        <input type="text" value={dates} onChange={e => setDates(e.target.value)} className="w-full p-4 bg-white border-2 border-gray-50 rounded-2xl font-bold focus:ring-4 focus:border-blue-500 transition-all" placeholder="2025-10-11, 2025-10-12" required />
                    </div>
                    <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Availability Cycles (12h Ranges)</label>
                        <input type="text" value={timeSlots} onChange={e => setTimeSlots(e.target.value)} className="w-full p-4 bg-white border-2 border-gray-50 rounded-2xl font-bold focus:ring-4 focus:border-blue-500 transition-all" placeholder="10AM-2PM, 5PM-8PM" required />
                    </div>
                    <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Appointment Slot Size</label>
                        <select
                            value={slotDurationMinutes}
                            onChange={event => setSlotDurationMinutes(Number(event.target.value))}
                            className="w-full p-4 bg-white border-2 border-gray-50 rounded-2xl font-bold focus:ring-4 focus:border-blue-500 transition-all"
                        >
                            {[5, 10, 15, 20, 30, 45, 60, 90, 120].map(minutes => (
                                <option key={minutes} value={minutes}>{minutes} minutes</option>
                            ))}
                        </select>
                        <p className="mt-2 text-xs text-gray-400">Each public booking reserves one slot of this length.</p>
                    </div>
                    <label className="flex items-center justify-between gap-4 rounded-2xl border-2 border-gray-100 bg-white p-4 cursor-pointer">
                        <span>
                            <span className="block text-sm font-bold text-gray-800">Public booking page</span>
                            <span className="block text-xs text-gray-400 mt-1">Only active events can be opened or shared publicly.</span>
                        </span>
                        <input type="checkbox" checked={isActive} onChange={event => setIsActive(event.target.checked)} className="h-5 w-5 accent-blue-600" />
                    </label>
                    <div>
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest block mb-2">Confirmation Button Destination</label>
                        <input
                            type="text"
                            inputMode="url"
                            value={confirmationRedirectUrl}
                            onChange={event => setConfirmationRedirectUrl(event.target.value)}
                            className="w-full p-4 bg-white border-2 border-gray-50 rounded-2xl font-bold focus:ring-4 focus:border-blue-500 transition-all"
                            placeholder="https://example.com/next-step"
                        />
                        <p className="mt-2 text-xs text-gray-400">Optional. The confirmation button goes to www.lvbranding.com when this is blank.</p>
                    </div>
                    {formError && <div className="text-xs text-red-600 font-black bg-red-50 p-4 rounded-2xl border border-red-100">{formError}</div>}
                    <div className="flex justify-end gap-3 pt-4">
                        <button type="button" onClick={onCancel} className="px-8 py-4 bg-white text-gray-400 rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-gray-100 transition-all">Discard</button>
                        <button type="submit" disabled={uploadingLogo} className="px-8 py-4 bg-black text-white rounded-2xl font-black uppercase tracking-widest text-[10px] hover:bg-gray-900 transition-all shadow-xl shadow-black/10 disabled:opacity-50 disabled:cursor-not-allowed">{uploadingLogo ? 'Uploading…' : 'Save Event'}</button>
                    </div>
                </div>
            </form>
            {event.id && (
                <BlockedSlotsManager
                    event={event}
                    bookings={bookings}
                    blockedSlots={blockedSlots}
                    onToggle={onToggleBlockedSlot}
                />
            )}
        </div>
    );
};

const BlockedSlotsManager = ({ event, bookings, blockedSlots, onToggle }) => {
    const [selectedDate, setSelectedDate] = useState(event.dates?.[0] || '');
    const [pendingKey, setPendingKey] = useState('');
    const slots = buildEventTimeSlots(event.timeSlots, event.slotDurationMinutes);

    useEffect(() => {
        if (!event.dates?.includes(selectedDate)) setSelectedDate(event.dates?.[0] || '');
    }, [event.dates, selectedDate]);

    const bookedTimes = new Set(
        bookings
            .filter(booking => booking.date === selectedDate)
            .map(booking => booking.time),
    );
    const blockedTimes = new Set(
        blockedSlots
            .filter(slot => slot.date === selectedDate)
            .map(slot => slot.time),
    );

    const toggle = async (displayTime) => {
        const time = convertTo24Hour(displayTime);
        const key = `${selectedDate}-${time}`;
        setPendingKey(key);
        await onToggle(event.id, selectedDate, displayTime, !blockedTimes.has(time));
        setPendingKey('');
    };

    return (
        <section className="mt-8 pt-8 border-t-2 border-gray-100">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3 mb-5">
                <div>
                    <h3 className="text-lg font-black tracking-tight text-gray-800">Block Appointment Times</h3>
                    <p className="text-sm text-gray-500 mt-1">Select an available time to block it. Select a blocked time again to reopen it.</p>
                </div>
                <div className="flex items-center gap-3 text-[11px] font-bold whitespace-nowrap">
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-white border border-gray-300" /> Available</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-amber-400" /> Blocked</span>
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-gray-300" /> Booked</span>
                </div>
            </div>

            <div className="flex gap-2 overflow-x-auto pb-2 mb-4">
                {(event.dates || []).map(date => (
                    <button
                        key={date}
                        type="button"
                        onClick={() => setSelectedDate(date)}
                        className={`shrink-0 rounded-xl border px-4 py-2 text-sm font-bold transition-colors ${selectedDate === date ? 'border-blue-600 bg-blue-600 text-white' : 'border-gray-200 bg-white text-gray-600 hover:border-blue-300'}`}
                    >
                        {format(new Date(`${date}T00:00:00`), 'EEE, MMM d')}
                    </button>
                ))}
            </div>

            <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
                {slots.map(displayTime => {
                    const time = convertTo24Hour(displayTime);
                    const isBooked = bookedTimes.has(time);
                    const isBlocked = blockedTimes.has(time);
                    const isPending = pendingKey === `${selectedDate}-${time}`;
                    return (
                        <button
                            key={displayTime}
                            type="button"
                            disabled={isBooked || isPending}
                            onClick={() => void toggle(displayTime)}
                            title={isBooked ? 'This slot already has a guest booking' : isBlocked ? 'Reopen this time' : 'Block this time'}
                            className={`rounded-xl border px-2 py-3 text-xs font-bold transition-all disabled:cursor-not-allowed ${
                                isBooked
                                    ? 'border-gray-200 bg-gray-200 text-gray-500'
                                    : isBlocked
                                        ? 'border-amber-400 bg-amber-400 text-amber-950 hover:bg-amber-300'
                                        : 'border-gray-200 bg-white text-gray-700 hover:border-amber-300 hover:bg-amber-50'
                            } ${isPending ? 'opacity-50' : ''}`}
                        >
                            {isPending ? 'Saving…' : displayTime}
                        </button>
                    );
                })}
            </div>
            <p className="text-xs text-gray-400 mt-4">Using {event.slotDurationMinutes}-minute slots. Save changes above before blocking times if you changed dates, hours, or slot size.</p>
        </section>
    );
};

// --- Booking Edit Form Component ---
const BookingEditForm = ({ booking, onSave, onCancel }) => {
    const [name, setName] = useState(booking.name);
    const [email, setEmail] = useState(booking.email);
    const [time, setTime] = useState(booking.time);

    const handleSubmit = (e) => {
        e.preventDefault();
        onSave(booking.id, { name, email, time });
    };

    return (
        <div className="bg-blue-50/50 p-8 rounded-[2rem] border-2 border-blue-100 animate-fade-in shadow-inner">
            <h3 className="text-xl font-black text-blue-900 mb-6 tracking-tighter uppercase">Manual Guest Override</h3>
            <form onSubmit={handleSubmit} className="grid grid-cols-1 sm:grid-cols-3 gap-6 items-end">
                <div>
                    <label className="text-[10px] font-black text-blue-400 uppercase tracking-widest block mb-2">Guest Name</label>
                    <input type="text" value={name} onChange={e => setName(e.target.value)} className="w-full p-4 bg-white border-2 border-blue-50 rounded-2xl font-bold text-blue-900" required />
                </div>
                <div>
                    <label className="text-[10px] font-black text-blue-400 uppercase tracking-widest block mb-2">Electronic Mail</label>
                    <input type="email" value={email} onChange={e => setEmail(e.target.value)} className="w-full p-4 bg-white border-2 border-blue-50 rounded-2xl font-bold text-blue-900" required />
                </div>
                <div>
                    <label className="text-[10px] font-black text-blue-400 uppercase tracking-widest block mb-2">Time Pointer</label>
                    <input type="text" value={time} onChange={e => setTime(e.target.value)} className="w-full p-4 bg-white border-2 border-blue-50 rounded-2xl font-bold text-blue-900" required />
                </div>
                <div className="sm:col-span-3 flex justify-end gap-3 mt-4">
                    <button type="button" onClick={onCancel} className="px-8 py-3 text-blue-400 font-black uppercase tracking-widest text-[10px] hover:text-blue-600 transition-all">Discard Changes</button>
                    <button type="submit" className="px-10 py-4 bg-blue-600 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-xl shadow-blue-200 hover:bg-blue-700 transition-all">Apply Override</button>
                </div>
            </form>
        </div>
    );
};
