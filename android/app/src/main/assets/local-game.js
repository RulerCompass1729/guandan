// Generated from shared rules; run node tools/build-native-engine.mjs
// source-sha256: c797c8dfee0b8b73441b599322ea21351cbe7e1c552e603166a8b03ade199abf
"use strict";
var GuandanOffline = (function() {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __commonJS = function(cb, mod) {
    return function __require() {
      return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
    };
  };

  // .local/native-engine-compiled/cards.js
  var require_cards = __commonJS({
    ".local/native-engine-compiled/cards.js": function(exports) {
      "use strict";
      var __values = exports && exports.__values || function(o) {
        var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
        if (m) return m.call(o);
        if (o && typeof o.length === "number") return {
          next: function() {
            if (o && i >= o.length) o = void 0;
            return { value: o && o[i++], done: !o };
          }
        };
        throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
      };
      var __read = exports && exports.__read || function(o, n) {
        var m = typeof Symbol === "function" && o[Symbol.iterator];
        if (!m) return o;
        var i = m.call(o), r, ar = [], e;
        try {
          while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
        } catch (error) {
          e = { error: error };
        } finally {
          try {
            if (r && !r.done && (m = i["return"])) m.call(i);
          } finally {
            if (e) throw e.error;
          }
        }
        return ar;
      };
      var __spreadArray = exports && exports.__spreadArray || function(to, from, pack) {
        if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
          if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
          }
        }
        return to.concat(ar || Array.prototype.slice.call(from));
      };
      Object.defineProperty(exports, "__esModule", { value: true });
      exports.SUIT_NAMES = exports.RANK_NAMES = exports.SUITS = void 0;
      exports.deck = deck;
      exports.wild = wild;
      exports.point = point;
      exports.label = label;
      exports.sorted = sorted;
      exports.shuffled = shuffled;
      exports.seeded = seeded;
      exports.SUITS = ["S", "H", "C", "D"];
      exports.RANK_NAMES = { 11: "J", 12: "Q", 13: "K", 14: "A", 16: "\u5C0F\u738B", 17: "\u5927\u738B" };
      exports.SUIT_NAMES = { S: "\u9ED1\u6843", H: "\u7EA2\u6843", C: "\u6885\u82B1", D: "\u65B9\u5757", J: "" };
      function deck() {
        var e_1, _a, e_2, _b;
        var cards = [];
        for (var copy = 0; copy < 2; copy++) {
          for (var rank = 2; rank <= 14; rank++)
            try {
              for (var SUITS_1 = (e_1 = void 0, __values(exports.SUITS)), SUITS_1_1 = SUITS_1.next(); !SUITS_1_1.done; SUITS_1_1 = SUITS_1.next()) {
                var suit = SUITS_1_1.value;
                cards.push({ id: cards.length, rank: rank, suit: suit });
              }
            } catch (e_1_1) {
              e_1 = { error: e_1_1 };
            } finally {
              try {
                if (SUITS_1_1 && !SUITS_1_1.done && (_a = SUITS_1.return)) _a.call(SUITS_1);
              } finally {
                if (e_1) throw e_1.error;
              }
            }
          try {
            for (var _c = (e_2 = void 0, __values([16, 17])), _d = _c.next(); !_d.done; _d = _c.next()) {
              var rank = _d.value;
              cards.push({ id: cards.length, rank: rank, suit: "J" });
            }
          } catch (e_2_1) {
            e_2 = { error: e_2_1 };
          } finally {
            try {
              if (_d && !_d.done && (_b = _c.return)) _b.call(_c);
            } finally {
              if (e_2) throw e_2.error;
            }
          }
        }
        return cards;
      }
      function wild(card, level) {
        return card.rank === level && card.suit === "H";
      }
      function point(rank, level) {
        return rank === level ? 15 : rank;
      }
      function label(card) {
        var _a;
        return exports.SUIT_NAMES[card.suit] + ((_a = exports.RANK_NAMES[card.rank]) !== null && _a !== void 0 ? _a : card.rank);
      }
      function sorted(cards, level) {
        return __spreadArray([], __read(cards), false).sort(function(a, b) {
          return point(a.rank, level) - point(b.rank, level) || exports.SUITS.indexOf(a.suit) - exports.SUITS.indexOf(b.suit) || a.id - b.id;
        });
      }
      function shuffled(items, random) {
        var _a;
        var result = __spreadArray([], __read(items), false);
        for (var i = result.length - 1; i > 0; i--) {
          var j = Math.floor(random() * (i + 1));
          _a = __read([result[j], result[i]], 2), result[i] = _a[0], result[j] = _a[1];
        }
        return result;
      }
      function seeded(seed) {
        var state = seed >>> 0;
        return function() {
          state += 1831565813;
          var t = state;
          t = Math.imul(t ^ t >>> 15, t | 1);
          t ^= t + Math.imul(t ^ t >>> 7, t | 61);
          return ((t ^ t >>> 14) >>> 0) / 4294967296;
        };
      }
    }
  });

  // .local/native-engine-compiled/rules.js
  var require_rules = __commonJS({
    ".local/native-engine-compiled/rules.js": function(exports) {
      "use strict";
      var __assign = exports && exports.__assign || function() {
        __assign = Object.assign || function(t) {
          for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
              t[p] = s[p];
          }
          return t;
        };
        return __assign.apply(this, arguments);
      };
      var __values = exports && exports.__values || function(o) {
        var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
        if (m) return m.call(o);
        if (o && typeof o.length === "number") return {
          next: function() {
            if (o && i >= o.length) o = void 0;
            return { value: o && o[i++], done: !o };
          }
        };
        throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
      };
      var __read = exports && exports.__read || function(o, n) {
        var m = typeof Symbol === "function" && o[Symbol.iterator];
        if (!m) return o;
        var i = m.call(o), r, ar = [], e;
        try {
          while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
        } catch (error) {
          e = { error: error };
        } finally {
          try {
            if (r && !r.done && (m = i["return"])) m.call(i);
          } finally {
            if (e) throw e.error;
          }
        }
        return ar;
      };
      var __spreadArray = exports && exports.__spreadArray || function(to, from, pack) {
        if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
          if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
          }
        }
        return to.concat(ar || Array.prototype.slice.call(from));
      };
      Object.defineProperty(exports, "__esModule", { value: true });
      exports.RULE_VERSION = void 0;
      exports.tier = tier;
      exports.beats = beats;
      exports.classify = classify;
      exports.legalPlays = legalPlays;
      exports.returnable = returnable;
      var cards_js_1 = require_cards();
      exports.RULE_VERSION = "gd-2022-home-v1";
      var NAMES = { single: "\u5355\u5F20", pair: "\u5BF9\u5B50", triple: "\u4E09\u5F20", fullhouse: "\u4E09\u5E26\u5BF9", straight: "\u987A\u5B50", pairs: "\u4E09\u8FDE\u5BF9", steel: "\u94A2\u677F", bomb: "\u70B8\u5F39", straightflush: "\u540C\u82B1\u987A", rocket: "\u56DB\u5927\u5929\u738B" };
      function fit(cards, level, needs) {
        var e_1, _a;
        if (needs.reduce(function(n, x) {
          return n + x.count;
        }, 0) !== cards.length)
          return null;
        var remaining = needs.flatMap(function(x) {
          return Array.from({ length: x.count }, function() {
            return { rank: x.rank, suit: x.suit };
          });
        });
        var ws = cards.filter(function(c) {
          return (0, cards_js_1.wild)(c, level);
        });
        var _loop_1 = function(card2) {
          if ((0, cards_js_1.wild)(card2, level))
            return "continue";
          var index = remaining.findIndex(function(x) {
            return x.rank === card2.rank && (!x.suit || x.suit === card2.suit);
          });
          if (index < 0)
            return { value: null };
          remaining.splice(index, 1);
        };
        try {
          for (var cards_1 = __values(cards), cards_1_1 = cards_1.next(); !cards_1_1.done; cards_1_1 = cards_1.next()) {
            var card = cards_1_1.value;
            var state_1 = _loop_1(card);
            if (typeof state_1 === "object")
              return state_1.value;
          }
        } catch (e_1_1) {
          e_1 = { error: e_1_1 };
        } finally {
          try {
            if (cards_1_1 && !cards_1_1.done && (_a = cards_1.return)) _a.call(cards_1);
          } finally {
            if (e_1) throw e_1.error;
          }
        }
        if (remaining.length !== ws.length || remaining.some(function(x) {
          return x.rank > 14;
        }))
          return null;
        return remaining.map(function(x, i) {
          return __assign({ id: ws[i].id, rank: x.rank }, x.suit ? { suit: x.suit } : {});
        });
      }
      function pattern(kind, high, count, substitutions) {
        return { id: "".concat(kind, ":").concat(high, ":").concat(count), kind: kind, high: high, count: count, name: kind === "bomb" ? "".concat(count, "\u5F20\u70B8\u5F39") : NAMES[kind], substitutions: substitutions };
      }
      function tier(p) {
        if (p.kind === "rocket")
          return 1e3;
        if (p.kind === "bomb")
          return p.count >= 6 ? 100 + p.count : p.count === 5 ? 80 : 70;
        return p.kind === "straightflush" ? 90 : 0;
      }
      function beats(candidate, lead) {
        if (!lead)
          return true;
        var a = tier(candidate), b = tier(lead);
        if (a !== b)
          return a > b;
        if (candidate.kind !== lead.kind || candidate.count !== lead.count)
          return false;
        return candidate.high > lead.high;
      }
      function sequence(start, length) {
        return Array.from({ length: length }, function(_, i) {
          return start + i === 1 ? 14 : start + i;
        });
      }
      function classify(cards, level) {
        var e_2, _a, e_3, _b, e_4, _c;
        var n = cards.length;
        if (!Number.isInteger(level) || level < 2 || level > 14 || n < 1 || n > 10 || new Set(cards.map(function(c) {
          return c.id;
        })).size !== n)
          return [];
        var ws = cards.filter(function(c) {
          return (0, cards_js_1.wild)(c, level);
        });
        if (ws.length > 2)
          return [];
        var result = [];
        var add = function(kind2, high, requirements) {
          var subs = fit(cards, level, requirements);
          if (subs)
            result.push(pattern(kind2, high, n, subs));
        };
        if (n === 1)
          return [pattern("single", (0, cards_js_1.point)(cards[0].rank, level), 1, [])];
        if (n === 4 && cards.filter(function(c) {
          return c.rank === 16;
        }).length === 2 && cards.filter(function(c) {
          return c.rank === 17;
        }).length === 2)
          result.push(pattern("rocket", 100, 4, []));
        if (n === 2 || n === 3 || n >= 4) {
          var kind = n === 2 ? "pair" : n === 3 ? "triple" : "bomb";
          for (var rank = 2; rank <= 14; rank++)
            add(kind, (0, cards_js_1.point)(rank, level), [{ rank: rank, count: n }]);
          if (n === 2)
            try {
              for (var _d = __values([16, 17]), _e = _d.next(); !_e.done; _e = _d.next()) {
                var rank = _e.value;
                add("pair", rank, [{ rank: rank, count: 2 }]);
              }
            } catch (e_2_1) {
              e_2 = { error: e_2_1 };
            } finally {
              try {
                if (_e && !_e.done && (_a = _d.return)) _a.call(_d);
              } finally {
                if (e_2) throw e_2.error;
              }
            }
        }
        if (n === 5) {
          var natural = cards.filter(function(c) {
            return !(0, cards_js_1.wild)(c, level);
          });
          var ranks = __spreadArray([], __read(new Set(natural.map(function(c) {
            return c.rank;
          }))), false);
          var _loop_2 = function(triple2) {
            var e_5, _h;
            if (natural.filter(function(c) {
              return c.rank === triple2;
            }).length + ws.length < 3)
              return "continue";
            var others = ranks.filter(function(r) {
              return r !== triple2;
            });
            var pairs = others.length ? others : Array.from({ length: 13 }, function(_, i) {
              return i + 2;
            });
            try {
              for (var pairs_1 = (e_5 = void 0, __values(pairs)), pairs_1_1 = pairs_1.next(); !pairs_1_1.done; pairs_1_1 = pairs_1.next()) {
                var pair = pairs_1_1.value;
                if (pair !== triple2)
                  add("fullhouse", (0, cards_js_1.point)(triple2, level), [{ rank: triple2, count: 3 }, { rank: pair, count: 2 }]);
              }
            } catch (e_5_1) {
              e_5 = { error: e_5_1 };
            } finally {
              try {
                if (pairs_1_1 && !pairs_1_1.done && (_h = pairs_1.return)) _h.call(pairs_1);
              } finally {
                if (e_5) throw e_5.error;
              }
            }
          };
          try {
            for (var _f = __values(ranks.filter(function(r) {
              return r <= 14;
            })), _g = _f.next(); !_g.done; _g = _f.next()) {
              var triple = _g.value;
              _loop_2(triple);
            }
          } catch (e_3_1) {
            e_3 = { error: e_3_1 };
          } finally {
            try {
              if (_g && !_g.done && (_b = _f.return)) _b.call(_f);
            } finally {
              if (e_3) throw e_3.error;
            }
          }
          var naturalFlush = ws.length === 0 && cards.every(function(c) {
            return c.suit === cards[0].suit;
          });
          for (var start = 1; start <= 10; start++) {
            var seq = sequence(start, 5);
            if (!naturalFlush)
              add("straight", start + 4, seq.map(function(rank2) {
                return { rank: rank2, count: 1 };
              }));
            var _loop_3 = function(suit2) {
              add("straightflush", start + 4, seq.map(function(rank2) {
                return { rank: rank2, count: 1, suit: suit2 };
              }));
            };
            try {
              for (var SUITS_1 = (e_4 = void 0, __values(cards_js_1.SUITS)), SUITS_1_1 = SUITS_1.next(); !SUITS_1_1.done; SUITS_1_1 = SUITS_1.next()) {
                var suit = SUITS_1_1.value;
                _loop_3(suit);
              }
            } catch (e_4_1) {
              e_4 = { error: e_4_1 };
            } finally {
              try {
                if (SUITS_1_1 && !SUITS_1_1.done && (_c = SUITS_1.return)) _c.call(SUITS_1);
              } finally {
                if (e_4) throw e_4.error;
              }
            }
          }
        }
        if (n === 6) {
          for (var start = 1; start <= 12; start++)
            add("pairs", start + 2, sequence(start, 3).map(function(rank2) {
              return { rank: rank2, count: 2 };
            }));
          for (var start = 1; start <= 13; start++)
            add("steel", start + 1, sequence(start, 2).map(function(rank2) {
              return { rank: rank2, count: 3 };
            }));
        }
        var unique = new Map(result.map(function(p) {
          return [p.id, p];
        }));
        return __spreadArray([], __read(unique.values()), false).sort(function(a, b) {
          return tier(b) - tier(a) || b.high - a.high || a.id.localeCompare(b.id);
        });
      }
      function legalPlays(hand, level, lead) {
        var e_6, _a, e_7, _b, e_8, _c;
        var _d, _e, _f, _g;
        var ws = hand.filter(function(c) {
          return (0, cards_js_1.wild)(c, level);
        });
        var natural = hand.filter(function(c) {
          return !(0, cards_js_1.wild)(c, level);
        });
        var groups = /* @__PURE__ */ new Map();
        try {
          for (var _h = __values((0, cards_js_1.sorted)(natural, level)), _j = _h.next(); !_j.done; _j = _h.next()) {
            var card = _j.value;
            var g = (_d = groups.get(card.rank)) !== null && _d !== void 0 ? _d : [];
            g.push(card);
            groups.set(card.rank, g);
          }
        } catch (e_6_1) {
          e_6 = { error: e_6_1 };
        } finally {
          try {
            if (_j && !_j.done && (_a = _h.return)) _a.call(_h);
          } finally {
            if (e_6) throw e_6.error;
          }
        }
        var seen = /* @__PURE__ */ new Set();
        var selections = /* @__PURE__ */ new Set();
        var result = [];
        var add = function(cards) {
          var e_9, _a2;
          var key = cards.map(function(c) {
            return c.id;
          }).sort(function(a, b) {
            return a - b;
          }).join(",");
          if (selections.has(key))
            return;
          selections.add(key);
          try {
            for (var _b2 = __values(classify(cards, level)), _c2 = _b2.next(); !_c2.done; _c2 = _b2.next()) {
              var p = _c2.value;
              if (beats(p, lead)) {
                var full = key + "/" + p.id;
                if (!seen.has(full)) {
                  seen.add(full);
                  result.push({ cards: cards, pattern: p });
                }
              }
            }
          } catch (e_9_1) {
            e_9 = { error: e_9_1 };
          } finally {
            try {
              if (_c2 && !_c2.done && (_a2 = _b2.return)) _a2.call(_b2);
            } finally {
              if (e_9) throw e_9.error;
            }
          }
        };
        var take = function(needs) {
          var e_10, _a2;
          var _b2;
          var cards = [];
          var used = 0;
          var _loop_5 = function(need2) {
            var available = ((_b2 = groups.get(need2.rank)) !== null && _b2 !== void 0 ? _b2 : []).filter(function(c) {
              return !need2.suit || c.suit === need2.suit;
            });
            var picked = available.slice(0, need2.count);
            cards.push.apply(cards, __spreadArray([], __read(picked), false));
            var missing = need2.count - picked.length;
            if (missing && need2.rank > 14 || used + missing > ws.length)
              return { value: void 0 };
            cards.push.apply(cards, __spreadArray([], __read(ws.slice(used, used + missing)), false));
            used += missing;
          };
          try {
            for (var needs_1 = __values(needs), needs_1_1 = needs_1.next(); !needs_1_1.done; needs_1_1 = needs_1.next()) {
              var need = needs_1_1.value;
              var state_2 = _loop_5(need);
              if (typeof state_2 === "object")
                return state_2.value;
            }
          } catch (e_10_1) {
            e_10 = { error: e_10_1 };
          } finally {
            try {
              if (needs_1_1 && !needs_1_1.done && (_a2 = needs_1.return)) _a2.call(needs_1);
            } finally {
              if (e_10) throw e_10.error;
            }
          }
          add(cards);
        };
        if (!lead || lead.kind === "single")
          try {
            for (var hand_1 = __values(hand), hand_1_1 = hand_1.next(); !hand_1_1.done; hand_1_1 = hand_1.next()) {
              var card = hand_1_1.value;
              add([card]);
            }
          } catch (e_7_1) {
            e_7 = { error: e_7_1 };
          } finally {
            try {
              if (hand_1_1 && !hand_1_1.done && (_b = hand_1.return)) _b.call(hand_1);
            } finally {
              if (e_7) throw e_7.error;
            }
          }
        for (var rank = 2; rank <= 17; rank++) {
          if (rank === 15)
            continue;
          var pool = (_e = groups.get(rank)) !== null && _e !== void 0 ? _e : [];
          var max = rank > 14 ? pool.length : Math.min(10, pool.length + ws.length);
          for (var count = 2; count <= max; count++) {
            if (count < 4 && lead && !(count === 2 && lead.kind === "pair" || count === 3 && lead.kind === "triple"))
              continue;
            for (var use = 0; use <= ws.length && use <= count; use++) {
              if (rank > 14 && use)
                continue;
              if (count - use <= pool.length)
                add(__spreadArray(__spreadArray([], __read(pool.slice(0, count - use)), false), __read(ws.slice(0, use)), false));
            }
          }
        }
        if (hand.filter(function(c) {
          return c.rank >= 16;
        }).length === 4)
          add(hand.filter(function(c) {
            return c.rank >= 16;
          }));
        if (!lead || lead.kind === "fullhouse") {
          for (var triple = 2; triple <= 14; triple++) {
            if (((_g = (_f = groups.get(triple)) === null || _f === void 0 ? void 0 : _f.length) !== null && _g !== void 0 ? _g : 0) + ws.length < 3)
              continue;
            for (var pair = 2; pair <= 17; pair++)
              if (pair !== triple && pair !== 15)
                take([{ rank: triple, count: 3 }, { rank: pair, count: 2 }]);
          }
        }
        if (!lead || lead.kind === "straight")
          for (var start = 1; start <= 10; start++)
            take(sequence(start, 5).map(function(rank2) {
              return { rank: rank2, count: 1 };
            }));
        for (var start = 1; start <= 10; start++) {
          var _loop_4 = function(suit2) {
            take(sequence(start, 5).map(function(rank2) {
              return { rank: rank2, count: 1, suit: suit2 };
            }));
          };
          try {
            for (var SUITS_2 = (e_8 = void 0, __values(cards_js_1.SUITS)), SUITS_2_1 = SUITS_2.next(); !SUITS_2_1.done; SUITS_2_1 = SUITS_2.next()) {
              var suit = SUITS_2_1.value;
              _loop_4(suit);
            }
          } catch (e_8_1) {
            e_8 = { error: e_8_1 };
          } finally {
            try {
              if (SUITS_2_1 && !SUITS_2_1.done && (_c = SUITS_2.return)) _c.call(SUITS_2);
            } finally {
              if (e_8) throw e_8.error;
            }
          }
        }
        if (!lead || lead.kind === "pairs")
          for (var start = 1; start <= 12; start++)
            take(sequence(start, 3).map(function(rank2) {
              return { rank: rank2, count: 2 };
            }));
        if (!lead || lead.kind === "steel")
          for (var start = 1; start <= 13; start++)
            take(sequence(start, 2).map(function(rank2) {
              return { rank: rank2, count: 3 };
            }));
        return result.sort(function(a, b) {
          return tier(a.pattern) - tier(b.pattern) || a.pattern.high - b.pattern.high || a.cards.length - b.cards.length;
        });
      }
      function returnable(hand, level) {
        var low = hand.filter(function(c) {
          return (0, cards_js_1.point)(c.rank, level) <= 10;
        });
        if (low.length)
          return (0, cards_js_1.sorted)(low, level);
        var min = Math.min.apply(Math, __spreadArray([], __read(hand.map(function(c) {
          return (0, cards_js_1.point)(c.rank, level);
        })), false));
        return (0, cards_js_1.sorted)(hand.filter(function(c) {
          return (0, cards_js_1.point)(c.rank, level) === min;
        }), level);
      }
    }
  });

  // .local/native-engine-compiled/game.js
  var require_game = __commonJS({
    ".local/native-engine-compiled/game.js": function(exports) {
      "use strict";
      var __extends = exports && exports.__extends || /* @__PURE__ */ (function() {
        var extendStatics = function(d, b) {
          extendStatics = Object.setPrototypeOf || { __proto__: [] } instanceof Array && function(d2, b2) {
            d2.__proto__ = b2;
          } || function(d2, b2) {
            for (var p in b2) if (Object.prototype.hasOwnProperty.call(b2, p)) d2[p] = b2[p];
          };
          return extendStatics(d, b);
        };
        return function(d, b) {
          if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
          extendStatics(d, b);
          function __() {
            this.constructor = d;
          }
          d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
        };
      })();
      var __assign = exports && exports.__assign || function() {
        __assign = Object.assign || function(t) {
          for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
              t[p] = s[p];
          }
          return t;
        };
        return __assign.apply(this, arguments);
      };
      var __read = exports && exports.__read || function(o, n) {
        var m = typeof Symbol === "function" && o[Symbol.iterator];
        if (!m) return o;
        var i = m.call(o), r, ar = [], e;
        try {
          while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
        } catch (error) {
          e = { error: error };
        } finally {
          try {
            if (r && !r.done && (m = i["return"])) m.call(i);
          } finally {
            if (e) throw e.error;
          }
        }
        return ar;
      };
      var __spreadArray = exports && exports.__spreadArray || function(to, from, pack) {
        if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
          if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
          }
        }
        return to.concat(ar || Array.prototype.slice.call(from));
      };
      var __values = exports && exports.__values || function(o) {
        var s = typeof Symbol === "function" && Symbol.iterator, m = s && o[s], i = 0;
        if (m) return m.call(o);
        if (o && typeof o.length === "number") return {
          next: function() {
            if (o && i >= o.length) o = void 0;
            return { value: o && o[i++], done: !o };
          }
        };
        throw new TypeError(s ? "Object is not iterable." : "Symbol.iterator is not defined.");
      };
      Object.defineProperty(exports, "__esModule", { value: true });
      exports.team = exports.partner = exports.RuleError = void 0;
      exports.newGame = newGame;
      exports.move = move;
      exports.advance = advance;
      exports.prepareTribute = prepareTribute;
      exports.returnCard = returnCard;
      exports.assertConservation = assertConservation;
      var cards_js_1 = require_cards();
      var rules_js_1 = require_rules();
      var RuleError = (
        /** @class */
        (function(_super) {
          __extends(RuleError2, _super);
          function RuleError2(code, message) {
            var _this = _super.call(this, message) || this;
            _this.code = code;
            return _this;
          }
          return RuleError2;
        })(Error)
      );
      exports.RuleError = RuleError;
      var partner = function(seat) {
        return (seat + 2) % 4;
      };
      exports.partner = partner;
      var team = function(seat) {
        return seat % 2;
      };
      exports.team = team;
      function newGame(level, random, first, roundId) {
        var cards = (0, cards_js_1.shuffled)((0, cards_js_1.deck)(), random);
        var hands = [[], [], [], []];
        cards.forEach(function(card, i) {
          return hands[i % 4].push(card);
        });
        return {
          roundId: roundId,
          level: level,
          hands: hands,
          turn: first,
          last: null,
          responders: [],
          finish: [],
          played: [],
          displays: [null, null, null, null],
          ply: 0,
          result: null,
          tribute: null
        };
      }
      function nextSeats(game, from) {
        return [1, 2, 3].map(function(n) {
          return (from + n) % 4;
        }).filter(function(s) {
          return game.hands[s].length > 0;
        });
      }
      function ordered(cards, p, level) {
        var effective = function(c) {
          var _a, _b;
          return (_b = (_a = p.substitutions.find(function(s) {
            return s.id === c.id;
          })) === null || _a === void 0 ? void 0 : _a.rank) !== null && _b !== void 0 ? _b : c.rank;
        };
        var lowAce = p.kind === "straight" || p.kind === "straightflush" ? p.high === 5 : p.kind === "pairs" ? p.high === 3 : p.kind === "steel" && p.high === 2;
        var value = function(c) {
          var r = effective(c);
          if (p.kind === "fullhouse")
            return (0, cards_js_1.point)(r, level) === p.high ? 0 : 1;
          return lowAce && r === 14 ? 1 : r;
        };
        return __spreadArray([], __read(cards), false).sort(function(a, b) {
          return value(a) - value(b) || a.id - b.id;
        });
      }
      function conclude(game) {
        var e_1, _a;
        var f = game.finish;
        var doubleDown = f.length >= 2 && (0, exports.team)(f[0]) === (0, exports.team)(f[1]);
        if (!doubleDown && f.length < 3)
          return false;
        var order = __spreadArray([], __read(f), false);
        try {
          for (var _b = __values([0, 1, 2, 3]), _c = _b.next(); !_c.done; _c = _b.next()) {
            var s = _c.value;
            if (!order.includes(s))
              order.push(s);
          }
        } catch (e_1_1) {
          e_1 = { error: e_1_1 };
        } finally {
          try {
            if (_c && !_c.done && (_a = _b.return)) _a.call(_b);
          } finally {
            if (e_1) throw e_1.error;
          }
        }
        var position = order.indexOf((0, exports.partner)(order[0]));
        game.result = { order: order, winner: (0, exports.team)(order[0]), upgrade: position === 1 ? 3 : position === 2 ? 2 : 1, doubleDown: doubleDown };
        game.turn = -1;
        game.responders = [];
        return true;
      }
      function move(game, seat, ids, declaration) {
        var _a;
        var _b, _c, _d, _e;
        if (game.result || ((_b = game.tribute) === null || _b === void 0 ? void 0 : _b.entries.some(function(x) {
          return !x.returned;
        })))
          throw new RuleError("PHASE", "\u73B0\u5728\u8FD8\u4E0D\u80FD\u51FA\u724C");
        if (game.turn !== seat || !((_c = game.hands[seat]) === null || _c === void 0 ? void 0 : _c.length))
          throw new RuleError("TURN", "\u8FD8\u6CA1\u8F6E\u5230\u4F60\uFF0C\u8BF7\u7A0D\u7B49");
        if (ids === null) {
          if (!game.last)
            throw new RuleError("MUST_LEAD", "\u8FD9\u4E00\u624B\u7531\u4F60\u5148\u51FA\uFF0C\u4E0D\u80FD\u4E0D\u8981");
          game.displays[seat] = { seat: seat, pass: true };
          game.responders.shift();
          game.ply++;
          if (game.responders.length)
            game.turn = game.responders[0];
          else {
            var previous = game.last.seat;
            game.turn = game.hands[previous].length ? previous : (0, exports.partner)(previous);
            game.last = null;
            game.displays = [null, null, null, null];
          }
          return null;
        }
        if (!Array.isArray(ids) || ids.length < 1 || ids.length > 10 || new Set(ids).size !== ids.length || ids.some(function(id) {
          return !Number.isInteger(id);
        }))
          throw new RuleError("SELECTION", "\u8BF7\u91CD\u65B0\u9009\u62E9\u8981\u51FA\u7684\u724C");
        var cards = ids.map(function(id) {
          return game.hands[seat].find(function(c) {
            return c.id === id;
          });
        });
        if (cards.some(function(c) {
          return !c;
        }))
          throw new RuleError("OWNERSHIP", "\u53EA\u80FD\u51FA\u81EA\u5DF1\u624B\u4E2D\u7684\u724C");
        var possibilities = (0, rules_js_1.classify)(cards, game.level);
        if (!possibilities.length)
          throw new RuleError("PATTERN", "\u724C\u578B\u4E0D\u5BF9\uFF0C\u8BF7\u91CD\u65B0\u9009\u724C");
        var p = declaration ? possibilities.find(function(x) {
          return x.id === declaration;
        }) : possibilities.find(function(x) {
          var _a2, _b2;
          return (0, rules_js_1.beats)(x, (_b2 = (_a2 = game.last) === null || _a2 === void 0 ? void 0 : _a2.pattern) !== null && _b2 !== void 0 ? _b2 : null);
        });
        if (!p)
          throw new RuleError("DECLARATION", declaration ? "\u914D\u724C\u89E3\u91CA\u5DF2\u53D8\u5316\uFF0C\u8BF7\u91CD\u65B0\u786E\u8BA4" : "\u8FD9\u624B\u724C\u538B\u4E0D\u8FC7\uFF0C\u8BF7\u91CD\u9009\u6216\u70B9\u4E0D\u8981");
        if (!(0, rules_js_1.beats)(p, (_e = (_d = game.last) === null || _d === void 0 ? void 0 : _d.pattern) !== null && _e !== void 0 ? _e : null))
          throw new RuleError("TOO_SMALL", "\u8FD9\u624B\u724C\u538B\u4E0D\u8FC7\uFF0C\u8BF7\u91CD\u9009\u6216\u70B9\u4E0D\u8981");
        var played = { seat: seat, cards: ordered(cards, p, game.level), pattern: p };
        game.hands[seat] = game.hands[seat].filter(function(c) {
          return !ids.includes(c.id);
        });
        (_a = game.played).push.apply(_a, __spreadArray([], __read(played.cards), false));
        game.last = played;
        game.displays[seat] = played;
        if (!game.hands[seat].length)
          game.finish.push(seat);
        game.ply++;
        if (!conclude(game)) {
          game.responders = nextSeats(game, seat);
          game.turn = game.responders[0];
        }
        return played;
      }
      function advance(levels, playedLevel, result) {
        var next = __spreadArray([], __read(levels), false);
        var passedA = playedLevel === 14 && levels[result.winner] === 14 && result.upgrade >= 2;
        next[result.winner] = Math.min(14, levels[result.winner] + result.upgrade);
        return { levels: next, matchWinner: passedA ? result.winner : null };
      }
      function prepareTribute(game, previous) {
        var e_2, _a;
        var _b = __read(previous.order, 4), first = _b[0], second = _b[1], last = _b[3];
        var givers = previous.doubleDown ? previous.order.slice(2) : [last];
        var bigJokers = givers.reduce(function(n, seat) {
          return n + game.hands[seat].filter(function(c) {
            return c.rank === 17;
          }).length;
        }, 0);
        if (bigJokers === 2) {
          game.turn = first;
          game.tribute = { entries: [], leader: first, note: "\u4E24\u5F20\u5927\u738B\u6297\u8D21\uFF0C\u5934\u6E38\u5148\u51FA" };
          return game.tribute;
        }
        var gifts = givers.map(function(giver) {
          var eligible = game.hands[giver].filter(function(c) {
            return !(0, cards_js_1.wild)(c, game.level);
          });
          var card = (0, cards_js_1.sorted)(eligible, game.level).at(-1);
          return { giver: giver, card: card };
        });
        if (gifts.length === 2)
          gifts.sort(function(a, b) {
            return (0, cards_js_1.point)(b.card.rank, game.level) - (0, cards_js_1.point)(a.card.rank, game.level) || (a.giver - first + 4) % 4 - (b.giver - first + 4) % 4;
          });
        var entries = gifts.map(function(gift, i) {
          return __assign(__assign({}, gift), { receiver: i === 0 ? first : second, returned: null });
        });
        var _loop_1 = function(e2) {
          game.hands[e2.giver] = game.hands[e2.giver].filter(function(c) {
            return c.id !== e2.card.id;
          });
          game.hands[e2.receiver].push(e2.card);
        };
        try {
          for (var entries_1 = __values(entries), entries_1_1 = entries_1.next(); !entries_1_1.done; entries_1_1 = entries_1.next()) {
            var e = entries_1_1.value;
            _loop_1(e);
          }
        } catch (e_2_1) {
          e_2 = { error: e_2_1 };
        } finally {
          try {
            if (entries_1_1 && !entries_1_1.done && (_a = entries_1.return)) _a.call(entries_1);
          } finally {
            if (e_2) throw e_2.error;
          }
        }
        game.turn = gifts[0].giver;
        game.tribute = { entries: entries, leader: game.turn, note: entries.length === 2 ? "\u53CC\u8D21\uFF0C\u6536\u8D21\u540E\u8BF7\u5404\u8FD8\u4E00\u5F20\u724C" : "\u5355\u8D21\uFF0C\u6536\u8D21\u540E\u8BF7\u8FD8\u4E00\u5F20\u724C" };
        return game.tribute;
      }
      function returnCard(game, seat, id) {
        var _a;
        var exchange = (_a = game.tribute) === null || _a === void 0 ? void 0 : _a.entries.find(function(e) {
          return e.receiver === seat && !e.returned;
        });
        if (!exchange)
          throw new RuleError("RETURN_PHASE", "\u73B0\u5728\u4E0D\u9700\u8981\u4F60\u8FD8\u724C");
        var card = (0, rules_js_1.returnable)(game.hands[seat], game.level).find(function(c) {
          return c.id === id;
        });
        if (!card)
          throw new RuleError("RETURN_CARD", "\u8BF7\u9009\u62E9\u63D0\u793A\u8303\u56F4\u5185\u7684\u4E00\u5F20\u8FD8\u724C");
        game.hands[seat] = game.hands[seat].filter(function(c) {
          return c.id !== id;
        });
        game.hands[exchange.giver].push(card);
        exchange.returned = card;
      }
      function assertConservation(game) {
        var all = __spreadArray(__spreadArray([], __read(game.hands.flat()), false), __read(game.played), false);
        if (all.length !== 108 || new Set(all.map(function(c) {
          return c.id;
        })).size !== 108 || all.some(function(c) {
          return c.id < 0 || c.id >= 108;
        }))
          throw new Error("card conservation violated");
      }
    }
  });

  // .local/native-engine-compiled/policy.js
  var require_policy = __commonJS({
    ".local/native-engine-compiled/policy.js": function(exports) {
      "use strict";
      Object.defineProperty(exports, "__esModule", { value: true });
      exports.decide = decide;
      var cards_js_1 = require_cards();
      var rules_js_1 = require_rules();
      function decide(obs) {
        var _a, _b;
        if (obs.returning)
          return { ids: [(0, rules_js_1.returnable)(obs.hand, obs.level)[0].id] };
        var options = (0, rules_js_1.legalPlays)(obs.hand, obs.level, (_b = (_a = obs.lead) === null || _a === void 0 ? void 0 : _a.pattern) !== null && _b !== void 0 ? _b : null);
        if (!options.length)
          return { ids: null };
        var finishing = options.find(function(p) {
          return p.cards.length === obs.hand.length;
        });
        if (finishing)
          return { ids: finishing.cards.map(function(c) {
            return c.id;
          }), patternId: finishing.pattern.id };
        var mateLeading = obs.lead && obs.lead.seat % 2 === obs.seat % 2;
        if (mateLeading)
          return { ids: null };
        var danger = obs.counts.some(function(n, seat) {
          return seat % 2 !== obs.seat % 2 && n > 0 && n <= 2;
        });
        var score = function(play) {
          var _a2;
          var bomb = (0, rules_js_1.tier)(play.pattern) > 0;
          var value = play.cards.length * (obs.lead ? 4 : 9) - play.pattern.high * 0.7 - (bomb ? 70 : 0);
          value -= play.cards.filter(function(c) {
            return (0, cards_js_1.wild)(c, obs.level);
          }).length * 10;
          if (danger && ((_a2 = obs.lead) === null || _a2 === void 0 ? void 0 : _a2.pattern.kind) === "single")
            value += play.pattern.high * 2;
          if (obs.hand.length - play.cards.length <= 2)
            value += 20;
          if (play.cards.length === 1) {
            var c_1 = play.cards[0];
            var groupSize = obs.hand.filter(function(x) {
              return (0, cards_js_1.point)(x.rank, obs.level) === (0, cards_js_1.point)(c_1.rank, obs.level);
            }).length;
            if (groupSize > 1)
              value -= groupSize * 5;
          }
          return value;
        };
        options.sort(function(a, b) {
          return score(b) - score(a) || a.cards.map(function(c) {
            return c.id;
          }).join(",").localeCompare(b.cards.map(function(c) {
            return c.id;
          }).join(","));
        });
        return { ids: options[0].cards.map(function(c) {
          return c.id;
        }), patternId: options[0].pattern.id };
      }
    }
  });

  // .local/native-engine-compiled/local-game.js
  var require_local_game = __commonJS({
    ".local/native-engine-compiled/local-game.js": function(exports) {
      var __assign = exports && exports.__assign || function() {
        __assign = Object.assign || function(t) {
          for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
              t[p] = s[p];
          }
          return t;
        };
        return __assign.apply(this, arguments);
      };
      var __read = exports && exports.__read || function(o, n) {
        var m = typeof Symbol === "function" && o[Symbol.iterator];
        if (!m) return o;
        var i = m.call(o), r, ar = [], e;
        try {
          while ((n === void 0 || n-- > 0) && !(r = i.next()).done) ar.push(r.value);
        } catch (error) {
          e = { error: error };
        } finally {
          try {
            if (r && !r.done && (m = i["return"])) m.call(i);
          } finally {
            if (e) throw e.error;
          }
        }
        return ar;
      };
      var __spreadArray = exports && exports.__spreadArray || function(to, from, pack) {
        if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
          if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
          }
        }
        return to.concat(ar || Array.prototype.slice.call(from));
      };
      Object.defineProperty(exports, "__esModule", { value: true });
      exports.dispatch = dispatch;
      var cards_js_1 = require_cards();
      var game_js_1 = require_game();
      var rules_js_1 = require_rules();
      var policy_js_1 = require_policy();
      function startRound(state) {
        var _a, _b, _c;
        var random = state.testSeed === void 0 ? Math.random : (0, cards_js_1.seeded)(state.testSeed + state.round);
        state.game = (0, game_js_1.newGame)(state.levels[state.activeTeam], random, Math.floor(random() * 4), "practice-" + state.round + "-" + Math.floor(random() * 4294967296).toString(16));
        if (state.result)
          (0, game_js_1.prepareTribute)(state.game, state.result);
        state.result = null;
        state.stage = ((_a = state.game.tribute) === null || _a === void 0 ? void 0 : _a.entries.length) ? "tribute" : "playing";
        state.notice = (_c = (_b = state.game.tribute) === null || _b === void 0 ? void 0 : _b.note) !== null && _c !== void 0 ? _c : "\u7B2C".concat(state.round, "\u526F\u5F00\u59CB");
      }
      function finish(state) {
        (0, game_js_1.assertConservation)(state.game);
        if (state.stage === "tribute" && !state.game.tribute.entries.some(function(e) {
          return !e.returned;
        }))
          state.stage = "playing";
        if (!state.game.result)
          return;
        var before = __spreadArray([], __read(state.levels), false), next = (0, game_js_1.advance)(state.levels, state.game.level, state.game.result);
        state.levels = next.levels;
        state.activeTeam = state.game.result.winner;
        state.result = __assign(__assign({}, state.game.result), { before: before, after: __spreadArray([], __read(state.levels), false), matchWinner: next.matchWinner });
        state.stage = next.matchWinner === null ? "roundOver" : "matchOver";
        state.notice = next.matchWinner === null ? "\u672C\u526F\u7ED3\u675F\uFF0C\u7EE7\u7EED\u4E0B\u4E00\u526F" : "\u5DF2\u8FC7A\uFF0C\u672C\u573A\u7ED3\u675F";
      }
      function view(state) {
        var _a, _b, _c, _d, _e;
        var g = state.game, positions = (_b = (_a = g.result) === null || _a === void 0 ? void 0 : _a.order) !== null && _b !== void 0 ? _b : g.finish;
        return {
          code: "\u672C\u673A\u7EC3\u4E60",
          version: state.version,
          ruleVersion: rules_js_1.RULE_VERSION,
          stage: state.stage,
          self: 0,
          host: 0,
          seats: [0, 1, 2, 3].map(function(index) {
            var _a2;
            return {
              index: index,
              name: index === 0 ? state.name : "\u7535\u8111" + (index + 1),
              kind: index === 0 ? "human" : "ai",
              connected: true,
              auto: index === 0 ? state.auto : false,
              count: g.hands[index].length,
              finish: positions.includes(index) ? ((_a2 = g.result) === null || _a2 === void 0 ? void 0 : _a2.doubleDown) && positions.indexOf(index) >= 2 ? 5 : positions.indexOf(index) + 1 : null
            };
          }),
          hand: (0, cards_js_1.sorted)(g.hands[0], g.level),
          levels: __spreadArray([], __read(state.levels), false),
          level: g.level,
          round: state.round,
          roundId: g.roundId,
          turn: g.turn,
          last: g.last,
          displays: g.displays,
          result: state.result,
          notice: state.notice,
          returnIds: state.stage === "tribute" && ((_c = g.tribute) === null || _c === void 0 ? void 0 : _c.entries.some(function(e) {
            return e.receiver === 0 && !e.returned;
          })) ? (0, rules_js_1.returnable)(g.hands[0], g.level).map(function(c) {
            return c.id;
          }) : [],
          tribute: (_e = (_d = g.tribute) === null || _d === void 0 ? void 0 : _d.entries.map(function(e) {
            return { giver: e.giver, receiver: e.receiver, card: e.card, done: e.returned !== null };
          })) !== null && _e !== void 0 ? _e : []
        };
      }
      function observation(state, seat, returning) {
        var g = state.game;
        return {
          seat: seat,
          hand: g.hands[seat],
          level: g.level,
          lead: g.last ? { seat: g.last.seat, pattern: g.last.pattern } : null,
          counts: g.hands.map(function(h) {
            return h.length;
          }),
          finished: g.finish,
          returning: returning
        };
      }
      function needsBot(state) {
        var _a, _b;
        if (state.stage === "tribute")
          return (_b = (_a = state.game.tribute.entries.find(function(e) {
            return !e.returned && (e.receiver !== 0 || state.auto);
          })) === null || _a === void 0 ? void 0 : _a.receiver) !== null && _b !== void 0 ? _b : null;
        if (state.stage === "playing" && (state.game.turn !== 0 || state.auto))
          return state.game.turn;
        return null;
      }
      function action(state, a) {
        var _a, _b;
        if (a.expectedVersion !== state.version)
          throw new game_js_1.RuleError("STALE", "\u724C\u684C\u5DF2\u7ECF\u66F4\u65B0\uFF0C\u8BF7\u91CD\u65B0\u64CD\u4F5C");
        if (a.roundId && a.roundId !== state.game.roundId)
          throw new game_js_1.RuleError("STALE", "\u5DF2\u7ECF\u662F\u65B0\u4E00\u526F\u724C");
        if (a.type === "auto" || a.type === "resume")
          state.auto = a.type === "auto";
        else if (a.type === "next" || a.type === "restart") {
          if (a.type === "next" && state.stage !== "roundOver" || a.type === "restart" && state.stage !== "matchOver")
            throw new game_js_1.RuleError("PHASE", "\u8BF7\u5148\u6253\u5B8C\u8FD9\u4E00\u526F");
          if (a.type === "restart") {
            state.levels = [2, 2];
            state.activeTeam = 0;
            state.round = 0;
            state.result = null;
          }
          state.round++;
          startRound(state);
        } else if (a.type === "return") {
          if (state.stage !== "tribute" || state.auto || ((_a = a.ids) === null || _a === void 0 ? void 0 : _a.length) !== 1)
            throw new game_js_1.RuleError("PHASE", "\u73B0\u5728\u4E0D\u80FD\u8FD8\u724C");
          (0, game_js_1.returnCard)(state.game, 0, a.ids[0]);
          state.notice = "\u5DF2\u8FD8\u724C";
        } else if (a.type === "play" || a.type === "pass") {
          if (state.stage !== "playing" || state.auto)
            throw new game_js_1.RuleError("PHASE", "\u8BF7\u5148\u63A5\u56DE\u81EA\u5DF1\u7684\u724C");
          var played = (0, game_js_1.move)(state.game, 0, a.type === "pass" ? null : (_b = a.ids) !== null && _b !== void 0 ? _b : [], a.patternId);
          state.notice = played ? state.name + "\u51FA\u4E86" + played.pattern.name : state.name + "\u4E0D\u8981";
        } else
          throw new game_js_1.RuleError("INPUT", "\u672C\u673A\u7EC3\u4E60\u4E0D\u652F\u6301\u8FD9\u4E2A\u64CD\u4F5C");
        state.version++;
        finish(state);
      }
      function hint(state, cursor) {
        var _a, _b, _c;
        var g = state.game;
        if (state.stage === "tribute") {
          if (!((_a = g.tribute) === null || _a === void 0 ? void 0 : _a.entries.some(function(e) {
            return e.receiver === 0 && !e.returned;
          })))
            return { ids: [], total: 0 };
          var options_1 = (0, rules_js_1.returnable)(g.hands[0], g.level);
          return { ids: [options_1[cursor % options_1.length].id], total: options_1.length };
        }
        if (state.stage !== "playing" || g.turn !== 0)
          throw new game_js_1.RuleError("TURN", "\u8FD8\u6CA1\u8F6E\u5230\u4F60\uFF0C\u8BF7\u7A0D\u7B49");
        var options = (0, rules_js_1.legalPlays)(g.hands[0], g.level, (_c = (_b = g.last) === null || _b === void 0 ? void 0 : _b.pattern) !== null && _c !== void 0 ? _c : null), preferred = (0, policy_js_1.decide)(observation(state, 0, false));
        var preferredOption = function(p) {
          var _a2;
          return p.pattern.id === preferred.patternId && p.cards.length === ((_a2 = preferred.ids) === null || _a2 === void 0 ? void 0 : _a2.length) && p.cards.every(function(c) {
            return preferred.ids.includes(c.id);
          });
        };
        options.sort(function(a, b) {
          return Number(preferredOption(b)) - Number(preferredOption(a));
        });
        var selected = options[cursor % options.length];
        return selected ? { ids: selected.cards.map(function(c) {
          return c.id;
        }), patternId: selected.pattern.id, total: options.length } : { ids: null, total: 0 };
      }
      function preview(state, ids) {
        var g = state.game;
        if (state.stage !== "playing")
          return { patterns: [], message: "\u73B0\u5728\u4E0D\u9700\u8981\u51FA\u724C" };
        var cards = ids.map(function(id) {
          return g.hands[0].find(function(c) {
            return c.id === id;
          });
        });
        if (!ids.length || new Set(ids).size !== ids.length || cards.some(function(c) {
          return !c;
        }))
          return { patterns: [], message: "\u8BF7\u9009\u62E9\u81EA\u5DF1\u624B\u4E2D\u7684\u724C" };
        var patterns = (0, rules_js_1.classify)(cards, g.level).filter(function(p) {
          var _a, _b;
          return (0, rules_js_1.beats)(p, (_b = (_a = g.last) === null || _a === void 0 ? void 0 : _a.pattern) !== null && _b !== void 0 ? _b : null);
        });
        return { patterns: patterns, message: patterns.length ? patterns[0].name : "\u724C\u578B\u4E0D\u5BF9\u6216\u538B\u4E0D\u8FC7\uFF0C\u8BF7\u91CD\u65B0\u9009\u62E9" };
      }
      function dispatch(json) {
        var _a, _b;
        try {
          var input = JSON.parse(json);
          var state = input.state;
          if (input.op === "new") {
            state = {
              version: 1,
              stage: "playing",
              name: String(input.name || "\u724C\u53CB").slice(0, 14),
              auto: false,
              round: 1,
              levels: [2, 2],
              activeTeam: 0,
              game: null,
              result: null,
              notice: ""
            };
            if (Number.isSafeInteger(input.testSeed))
              state.testSeed = input.testSeed;
            startRound(state);
          } else {
            if (!(state === null || state === void 0 ? void 0 : state.game) || ((_a = state.game.hands) === null || _a === void 0 ? void 0 : _a.length) !== 4 || !Number.isSafeInteger(state.version))
              throw new game_js_1.RuleError("STATE", "\u7EC3\u4E60\u8FDB\u5EA6\u4E0D\u5B8C\u6574\uFF0C\u8BF7\u91CD\u65B0\u5F00\u59CB");
            (0, game_js_1.assertConservation)(state.game);
            if (input.op === "action")
              action(state, input.action);
            else if (input.op === "tick") {
              var seat = needsBot(state);
              if (seat !== null) {
                var d = (0, policy_js_1.decide)(observation(state, seat, state.stage === "tribute"));
                if (state.stage === "tribute") {
                  (0, game_js_1.returnCard)(state.game, seat, d.ids[0]);
                  state.notice = "\u7535\u8111\u5DF2\u8FD8\u724C";
                } else {
                  var p = (0, game_js_1.move)(state.game, seat, d.ids, d.patternId);
                  state.notice = (seat === 0 ? state.name : "\u7535\u8111" + (seat + 1)) + (p ? "\u51FA\u4E86" + p.pattern.name : "\u4E0D\u8981");
                }
                state.version++;
                finish(state);
              }
            }
          }
          var result = { state: state, view: view(state), needsBot: needsBot(state) !== null };
          if (input.op === "hint")
            Object.assign(result, hint(state, Math.max(0, Number(input.cursor) || 0)));
          if (input.op === "preview")
            Object.assign(result, preview(state, (_b = input.ids) !== null && _b !== void 0 ? _b : []));
          return JSON.stringify(result);
        } catch (error) {
          return JSON.stringify({ error: error instanceof Error ? error.message : "\u7EC3\u4E60\u6682\u65F6\u672A\u80FD\u5904\u7406", code: error instanceof game_js_1.RuleError ? error.code : "STATE" });
        }
      }
    }
  });
  return require_local_game();
})();
